---
status: active
owner: Lê Khoa
started: 2026-10-21
current-phase: 5
summary: "Downloadable on-device AI models (small GGUF LLMs run by a bundled llama.cpp server) for subtitle translation and the other AI features, picked from a Models-style page like the speech models."
tags: [area/translation, area/ai, stack/rust]
---

# on device ai model

Owner, 21/10: Apple's built-in translation is too poor; Macs without Apple Intelligence still need AI translation.
Ship small on-device AI models, downloaded on demand, with a page like the speech-model page (recommended cards,
downloaded list, downloadable list with accuracy/speed bars). Models over 5 GB are too heavy for most users: listed and
downloadable, never recommended.

## Decisions (owner, 21/10)

- New dependency approved: llama.cpp `llama-server` (MIT), bundled and run as its own process (the speech engine
  already links a ggml copy; one process each avoids symbol clashes and a crash in one does not take the app down).
- No HY-MT1.5 (Tencent licence excludes the EU, the UK and South Korea).
- Scope: subtitles and the other AI features (dictation translation and clean-up), not subtitles only.
- Recommended set chosen after the benchmark below; models over 5 GB stay downloadable only.

## Benchmark (21/10, M4 Max 64 GB, other work running; 30 real YouTube lines, EN→VI, Q4_K_M, llama.cpp b11607)

| Model              | File    | RAM    | p50 / p95 per line | "stream snipe" kept | Notes                                   |
| ------------------ | ------- | ------ | ------------------ | ------------------- | --------------------------------------- |
| Apple Intelligence | -       | system | ≈1.2 / 1.9 s       | 0/3                 | fluent; mistranslates terms of art      |
| Qwen3.5 2B         | 1.28 GB | 1.7 GB | 0.21 / 0.32 s      | 3/3                 | fastest; sometimes drops a clause       |
| Gemma 4 E2B        | 3.11 GB | 3.2 GB | 0.26 / 0.35 s      | 3/3                 | most natural of the small ones          |
| Qwen3.5 4B         | 2.74 GB | 3.5 GB | 0.36 / 0.46 s      | 3/3                 | close to Gemma 4 E2B, more literal      |
| Gemma 4 E4B        | 4.98 GB | 5.1 GB | 0.38 / 0.45 s      | 3/3                 | heavy                                   |
| Qwen3.5 9B         | 5.68 GB | 6.3 GB | 0.61 / 0.74 s      | 3/3                 | too heavy (owner: > 5 GB not practical) |
| TranslateGemma 4B  | 2.49 GB | 3.2 GB | 0.33 / 0.44 s      | 2/3                 | adds content to fragmentary lines       |
| TranslateGemma 12B | 7.30 GB | 8.9 GB | 0.92 / 1.18 s      | 2/3                 | invents and explains; dropped           |

Finding: general instruction models with the app's subtitle prompt beat dedicated translation models on recogniser
output (fragments, streamer slang); they also take the prompt's context and terms. Licences: Qwen3.5 Apache 2.0;
Gemma 4 Apache 2.0 (model card), not gated. Script and outputs: session scratchpad `mtbench/` (not kept).

## Packaging spike (21/10)

- The prebuilt `llama-server` (b11607) links 11 `@rpath` dylibs - each would need its own signature, and a downloaded
  helper that dlopens unsigned dylibs hangs on Gatekeeper. Built from source instead at tag b11607:
  `BUILD_SHARED_LIBS=OFF GGML_METAL=ON GGML_METAL_EMBED_LIBRARY=ON GGML_NATIVE=OFF GGML_RPC=OFF LLAMA_CURL=OFF`,
  arm64, `MACOSX_DEPLOYMENT_TARGET=14.0` → one 21.8 MB file linking only system frameworks (Metal, Accelerate,
  Foundation). Same 30 lines: Qwen3.5 2B p50 0.17 / p95 0.22 s; official Gemma 4 E2B QAT q4_0 p50 0.23 / p95 0.28 s.
- Files to ship (pinned revision + sha256):
  - Qwen3.5 2B: `unsloth/Qwen3.5-2B-GGUF` @ f6d5376b, `Qwen3.5-2B-Q4_K_M.gguf`, 1.28 GB, sha256 aaf42c8b… (no official
    Qwen GGUF for the 3.5 small models; Apache 2.0).
  - Gemma 4 E2B: `google/gemma-4-E2B-it-qat-q4_0-gguf` @ 675cff42, `gemma-4-E2B_q4_0-it.gguf`, 3.35 GB, sha256
    fa401b55… (official, Apache 2.0, not gated).
  - Qwen3.5 4B: `unsloth/Qwen3.5-4B-GGUF` @ e87f1764, `Qwen3.5-4B-Q4_K_M.gguf`, 2.74 GB, sha256 00fe7986….
  - Listed, not recommended (> 5 GB or heavy): Gemma 4 E4B, Qwen3.5 9B.
- Apple silicon only (macOS 14+); Intel Macs keep the cloud providers.

## Phase 3 gate (21/10, signed release bundle, server in Contents/MacOS)

Subtitle probe, 51 s TTS clip (15 lines), partials every second, recogniser Qwen3-ASR 1.7B on Metal at the same time:

| Translator          | Translation after the end of speech p50 / p95 | Source p50 / p95 | CPU avg / max | First load |
| ------------------- | --------------------------------------------- | ---------------- | ------------- | ---------- |
| Apple Intelligence  | 1.21 / 1.88 s (20/10)                         | 0.78 s p95       | 2 / 5 %       | -          |
| Qwen3.5 2B (local)  | 0.62 / 0.81 s                                 | 0.36 / 0.58 s    | 1.8 / 3 %     | 4.9 s      |
| Gemma 4 E2B (local) | 0.68 / 0.87 s                                 | 0.34 / 0.57 s    | 2.0 / 3 %     | 3.1 s      |

0 refused, 15/15 translated; no server left after the probe. `codesign --verify --deep --strict` passes with the
helper inside.

Notarization check (21/10, df30324 build, nothing published): `notarytool submit` → Accepted, 0 issues; stapled copy
with a quarantine flag → `spctl` "accepted, source=Notarized Developer ID"; the quarantined helper runs
(`llama-server --version`, 0.37 s, no Gatekeeper hang). `spctl` calls the bare helper "not an app", as it does any
command-line tool.

## Phases (each with a verify command)

1. Catalog + download: AI models in the catalog (id, file, size, RAM, speed/accuracy ratings, recommended slot,
   licence), reusing the speech-model download pipeline (progress, cancel, delete).
   → verify: `cargo test` for catalog parsing; download + delete of Qwen3.5 2B through the app's command.
2. Server: bundle `llama-server` (signed, inside the app), start it on demand with the chosen model on a local port,
   stop it after the idle timeout the speech model uses.
   → verify: probe flag starts the server, translates 30 lines, reports p50/p95 and RSS; process gone after stop.
3. Providers: a "Model trên máy" provider for the AI features (llm_client against the local server); live subtitles
   pick Apple Intelligence or the local model (Auto = Apple Intelligence when available, else the local model).
   → verify: subtitle probe with the local model: translation p95 ≤ 3 s end to end, recogniser still on the GPU.
4. Page: "Mô hình AI" page like the speech models - recommended cards (Nhẹ nhất / Cân bằng / Chính xác nhất, all
   ≤ 5 GB), downloaded list (active badge, Xóa), downloadable list incl. > 5 GB marked heavy, RAM hint from this Mac.
   → verify: tsc, eslint, translations, browser preview screenshot.
5. Docs + licences: ux/logic docs, NOTICE (llama.cpp MIT; models fetched from their own licences), CHANGELOG.
   → verify: doc-index clean; CI app + rust green.

## Open risks

1. GPU sharing with the speech model (Qwen3-ASR on Metal) may raise subtitle delay; measure in phase 3.
2. Slow Macs (8 GB M1) may be 3-5× slower than the M4 Max numbers (estimate); measure if one is available.
3. Signing/notarising a bundled helper binary; Gatekeeper on its dylibs (see lesson
   `quarantined-sidecar-never-answers` in the owner's memory).
4. Disk: a model is 1.3-5.7 GB; show sizes before download.

## Next safe step

Phase 1: add the AI-model catalog entries and reuse the download pipeline (after the Models-page survey).
