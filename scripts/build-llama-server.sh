#!/usr/bin/env bash
# Builds the on-device AI model server SpeakEase bundles: llama.cpp's
# `llama-server` (MIT) from a pinned tag, as ONE static file with the Metal
# library embedded, so the app ships no extra dylibs (each would need its own
# signature, and a helper loading unsigned dylibs hangs on Gatekeeper).
# The result is signed with the app's Developer ID and hardened runtime and
# placed at src-tauri/binaries/llama-server (git-ignored), which
# tauri.conf.json copies to Contents/MacOS/llama-server.
#
#   scripts/build-llama-server.sh          build if missing or out of date
#   scripts/build-llama-server.sh --force  rebuild
#
# Apple silicon, macOS 14+. Needs cmake and Xcode's command-line tools.
set -euo pipefail

tag="b11607"
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/src-tauri/binaries/llama-server"
stamp="$out.tag"
work="${LLAMA_BUILD_DIR:-$root/src-tauri/target/llama-cpp-$tag}"
identity="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["bundle"]["macOS"]["signingIdentity"])' "$root/src-tauri/tauri.conf.json")"

if [[ "${1:-}" != "--force" && -x "$out" && "$(cat "$stamp" 2>/dev/null)" == "$tag" ]]; then
  echo "llama-server $tag is already built: $out"
  exit 0
fi

command -v cmake >/dev/null || { echo "NO_CMAKE: install cmake (brew install cmake)" >&2; exit 1; }

if [[ ! -d "$work/.git" ]]; then
  rm -rf "$work"
  git clone --quiet --depth 1 --branch "$tag" https://github.com/ggml-org/llama.cpp.git "$work"
fi

export MACOSX_DEPLOYMENT_TARGET=14.0
cmake -S "$work" -B "$work/build" -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DBUILD_SHARED_LIBS=OFF -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON -DGGML_NATIVE=OFF \
  -DGGML_RPC=OFF -DLLAMA_CURL=OFF -DLLAMA_OPENSSL=OFF -DLLAMA_BUILD_TESTS=OFF \
  -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_TOOLS=ON -DLLAMA_BUILD_SERVER=ON >/dev/null
cmake --build "$work/build" --target llama-server -j "$(sysctl -n hw.ncpu)" >/dev/null

# Only system frameworks may be linked, or the bundle would need the dylibs.
if otool -L "$work/build/bin/llama-server" | tail -n +2 | grep -v -e '^\s*/System/' -e '^\s*/usr/lib/'; then
  echo "NOT_STATIC: llama-server links libraries outside the system" >&2
  exit 1
fi

mkdir -p "$(dirname "$out")"
cp "$work/build/bin/llama-server" "$out"
codesign --force --sign "$identity" --options runtime --timestamp "$out"
codesign --verify --strict "$out"
echo "$tag" > "$stamp"
echo "built llama-server $tag: $out ($(du -h "$out" | cut -f1))"
