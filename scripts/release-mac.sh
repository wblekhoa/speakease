#!/usr/bin/env bash
# Builds a SpeakEase release for Apple Silicon Macs: the app signed with the
# Developer ID in tauri.conf.json, notarized and stapled; a .zip and a .dmg
# for people to download; and, for the in-app updater, the stapled app as a
# .tar.gz, its minisign signature and latest.json. With --publish it then
# creates the GitHub release v<version> with those files.
#
#   scripts/release-mac.sh              build everything into release/<version>/
#   scripts/release-mac.sh --publish    ... and publish it on GitHub
#
# The updater archive is made HERE, from the stapled app - not by
# `tauri build`, which would sign the bundle before notarization (the same
# choice as ReadEase). Secrets come from $SPEAKEASE_ENV_FILE (default
# ~/JAK/.env, outside the repo) and are never printed:
#   SPEAKEASE_UPDATER_KEY_PATH, TAURI_SIGNING_PRIVATE_KEY_PASSWORD_SPEAKEASE
# Notarization uses the keychain profile SPEAKEASE_NOTARY_PROFILE
# (default: readease-notary - the same developer account).
set -euo pipefail

publish=0
[[ "${1:-}" == "--publish" ]] && publish=1

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
env_file="${SPEAKEASE_ENV_FILE:-$HOME/JAK/.env}"
if [[ -f "$env_file" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
fi
updater_key="${SPEAKEASE_UPDATER_KEY_PATH:-$HOME/.tauri/speakease-updater.key}"
updater_password="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD_SPEAKEASE:-}"
notary_profile="${SPEAKEASE_NOTARY_PROFILE:-readease-notary}"
[[ -f "$updater_key" ]] || { echo "NO_UPDATER_KEY: $updater_key" >&2; exit 1; }
[[ -n "$updater_password" ]] || { echo "NO_UPDATER_PASSWORD: set TAURI_SIGNING_PRIVATE_KEY_PASSWORD_SPEAKEASE" >&2; exit 1; }

version="$(python3 -c 'import json;print(json.load(open("src-tauri/tauri.conf.json"))["version"])')"
tag="v$version"
out="$root/release/$version"
app="$root/src-tauri/target/release/bundle/macos/SpeakEase.app"
base="SpeakEase-$version-arm64"
repo="wblekhoa/speakease"
echo "==> SpeakEase $version"

if [[ "$publish" == "1" ]] && gh release view "$tag" -R "$repo" >/dev/null 2>&1; then
  echo "RELEASE_EXISTS: $tag is already published; bump the version first" >&2
  exit 1
fi

echo "==> building"
bun run tauri build --bundles app

echo "==> verifying the Developer ID signature"
codesign --verify --deep --strict "$app"
# Read into a variable, then judge it: `codesign | grep -q` under pipefail
# fails when grep closes the pipe on its first match (ReadEase, 16/09).
signature="$(codesign -dvv "$app" 2>&1 || true)"
grep -q "Authority=Developer ID Application" <<<"$signature" || { echo "NOT_DEVELOPER_ID" >&2; exit 1; }

# Submit one file to the notary service and wait for Apple's verdict; a
# rejection prints Apple's log and stops the release.
notarize() {
  local file="$1" result
  result="$(xcrun notarytool submit "$file" --keychain-profile "$notary_profile" --wait 2>&1)"
  printf '%s\n' "$result" | sed 's/^/    /'
  if ! grep -q "status: Accepted" <<<"$result"; then
    local id
    id="$(grep -m1 -o 'id: [0-9a-f-]*' <<<"$result" | cut -d' ' -f2)"
    [[ -n "$id" ]] && xcrun notarytool log "$id" --keychain-profile "$notary_profile" 2>&1 | sed 's/^/    /'
    echo "NOTARIZATION_FAILED: $file" >&2
    exit 1
  fi
}

echo "==> notarizing the app"
work="$(mktemp -d)"
ditto -c -k --keepParent "$app" "$work/SpeakEase.zip"
notarize "$work/SpeakEase.zip"
xcrun stapler staple "$app" | sed 's/^/    /'
verdict="$(spctl -a -t exec -vv "$app" 2>&1 || true)"
printf '%s\n' "$verdict" | sed 's/^/    /'
grep -q "accepted" <<<"$verdict" || { echo "GATEKEEPER_FAILED" >&2; exit 1; }

rm -rf "$out"
mkdir -p "$out"

echo "==> zip"
ditto -c -k --keepParent "$app" "$out/$base.zip"

echo "==> disk image"
staging="$work/dmg"
mkdir -p "$staging"
ditto "$app" "$staging/SpeakEase.app"
ln -s /Applications "$staging/Applications"
hdiutil create -volname "SpeakEase" -srcfolder "$staging" -ov -format UDZO -quiet "$out/$base.dmg"
identity="$(python3 -c 'import json;print(json.load(open("src-tauri/tauri.conf.json"))["bundle"]["macOS"]["signingIdentity"])')"
codesign --sign "$identity" --timestamp "$out/$base.dmg"
notarize "$out/$base.dmg"
xcrun stapler staple "$out/$base.dmg" | sed 's/^/    /'

echo "==> updater archive"
COPYFILE_DISABLE=1 tar -czf "$out/$base.app.tar.gz" -C "$(dirname "$app")" SpeakEase.app
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$updater_password" \
  bunx tauri signer sign -f "$updater_key" "$out/$base.app.tar.gz" >/dev/null
[[ -f "$out/$base.app.tar.gz.sig" ]] || { echo "UPDATER_SIGN_FAILED" >&2; exit 1; }

# Release notes: the CHANGELOG section for this version.
notes="$(python3 - "$version" <<'PY'
import re, sys
version = sys.argv[1]
text = open("CHANGELOG.md").read()
m = re.search(r"^## .*?\b" + re.escape(version) + r"\b.*?$(.*?)(?=^## |\Z)", text, re.S | re.M)
print(m.group(1).strip() if m else f"SpeakEase {version}")
PY
)"
python3 - "$version" "$out/$base.app.tar.gz.sig" "https://github.com/$repo/releases/download/$tag/$base.app.tar.gz" "$notes" > "$out/latest.json" <<'PY'
import json, sys, datetime
version, sig_path, url, notes = sys.argv[1:]
print(json.dumps({
    "version": version,
    "notes": notes,
    "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "platforms": {"darwin-aarch64": {"signature": open(sig_path).read().strip(), "url": url}},
}, ensure_ascii=False, indent=2))
PY
rm -rf "$work"

echo "==> built in $out"
ls -1 "$out" | sed 's/^/    /'

if [[ "$publish" == "1" ]]; then
  echo "==> publishing $tag"
  gh release create "$tag" -R "$repo" --title "SpeakEase $version" --notes "$notes" \
    "$out/$base.dmg" "$out/$base.zip" "$out/$base.app.tar.gz" "$out/latest.json"
  # The updater reads latest.json from the newest release; prove it answers.
  curl -fsSL "https://github.com/$repo/releases/latest/download/latest.json" \
    | python3 -c 'import json,sys; print("    latest.json says", json.load(sys.stdin)["version"])'
else
  echo "    not published (run with --publish to create the GitHub release)"
fi
