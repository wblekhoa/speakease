---
status: proposed
owner: Lê Khoa
started: 2026-10-16
current-phase: 0
summary: "Beta of live translated subtitles: capture one app's sound, recognise it on the Mac, translate each sentence with the app's AI, show a bilingual floating bar, behind the Experimental switch."
tags: [area/audio, area/capture, area/translation, area/ai, area/permissions, stack/swift, stack/rust, stack/tauri, surface/macos]
---
# Live subtitles beta

Owner decisions: `docs/product/decisions.md` › "2026-10-16 · Live subtitles beta" (round 1). This plan does not
re-open them. Release still waits for the owner's "phát hành".

## What the beta does

1. The user picks **one app** (Chrome, Zoom, Podcasts…), a **source language** and a **target language**.
2. SpeakEase taps that app's sound only (Core Audio process tap, macOS 14.2+; hidden on older macOS).
3. The selected recognition model turns it into text on the Mac; the source line updates live (owner slider 2/5 =
   "show now, may correct").
4. Each finished sentence goes to the AI already set up in the app (one call per sentence, with the previous 1-2
   sentences as context, transcript fenced in `<transcript>` tags), and the target line appears under it.
5. A floating bar at the bottom of the screen shows the two lines (source small and dim, target large); it never takes
   focus and can be dragged.
6. Start/stop: its own shortcut, a tray item, a button in the window. On stop the whole session is saved to History.
7. Everything sits behind App › Experimental.

Pass criteria (owner): under 3 s from end of a spoken sentence to its translation on screen; translation faithful and
natural; works on YouTube, Zoom and a podcast app. Watched but not gates: CPU/heat, one hour without error.

## Facts already measured

- Recognition: 6.4 s English clip in 0.53 s (Qwen3-ASR 1.7B Q5_K_M, Metal, M4 Max), word-perfect; model load 0.49 s
  (kept warm in the app). Command: `handy --transcribe-file <wav> --json`.
- Swift is already built and linked by `src-tauri/build.rs` (`swift/apple_intelligence.swift` + bridge header), so the
  tap can be a new Swift file in the same pipeline - likely no new crate.
- `minimumSystemVersion` is 10.15 (`src-tauri/tauri.conf.json`); the tap needs a runtime OS check.
- Reusable: non-activating NSPanel overlay (`src-tauri/src/overlay.rs`), Silero VAD, `post_process_transcription`
  and the translate steps (`src-tauri/src/actions.rs`), `save_titled_entry` (`src-tauri/src/managers/history.rs`),
  the Experimental switch (`experimental_enabled` in `src-tauri/src/settings.rs`).

## Phases (each with a verify command)

### Phase 0 - Probe: can we hear one app, and how fast is the whole chain? (≈1 day, no UI)
- `swift/system_audio_tap.swift`: list processes that are playing sound; tap the chosen app (all its processes - see
  risk 1) through a private aggregate device; deliver 16 kHz mono float frames to Rust through a C callback.
- `NSAudioCaptureUsageDescription` in `src-tauri/Info.plist`; confirm whether the hardened runtime needs an extra
  entitlement.
- A hidden CLI flag `--live-subtitle-probe <bundle-id> --seconds N` that runs tap → VAD → recognition → AI translation
  and writes one JSON line per sentence: audio end time, source text time, target text time.
- verify: `swiftc` build passes in `cargo build`; on the **secondary screen**, play an English YouTube video in Chrome
  and run the probe for 120 s → JSON shows non-silent audio, sentences in order, p50/p95 delays.
  `plutil -p <built app>/Contents/Info.plist | grep NSAudioCapture` shows the key.
- **Stop gate**: p95 source-text delay ≤ 1.5 s and p95 translation delay ≤ 3 s. If missed, report numbers and options
  to the owner before Phase 1.

### Phase 1 - The pipeline in Rust (≈2 days)
- `src-tauri/src/managers/live_subtitles.rs`: rolling buffer of the open segment; re-recognise it about once a second
  (source line); close it at a pause ≥ 400 ms (VAD) or at 12 s; translate closed segments in order, cancel pending
  calls on stop, skip ahead if more than 3 sentences queue up (stay live rather than fall behind).
- Translation: one step source → target. The 2026-10-09 "through English" rule was measured on Apple's on-device
  model; Phase 0 checks direct quality with the configured AI. If a pivot is needed, record a new decision.
- Pure functions (segment boundaries, queue skipping, context window) get unit tests like `chunk_bounds`.
- verify: `cargo test live_subtitles`; `cargo clippy`; the probe from Phase 0 now runs through this manager and
  meets the same gate.

### Phase 2 - Floating bilingual bar (≈1-2 days)
- A second overlay window (non-activating NSPanel like the recording pill), bottom centre, draggable, position kept;
  shows the latest sentence pair; fades after a few seconds of silence; never steals focus or clicks except its handle.
- Browser preview under the mock (`?subtitles` state) for layout in light/dark.
- verify: `bun run lint`, `bun run check:translations`, preview screenshot; a real run on the secondary screen with
  focus staying in Chrome (frontmost app checked by metadata, not by reading documents).

### Phase 3 - Controls and permission (≈1-2 days)
- App › Experimental on → a "Live subtitles" block (Speak page): app picker (apps currently playing sound), source and
  target language (target defaults to the shared translate language), Start/Stop button.
- Shortcut binding `live_subtitles` (default key: round 2), tray item "Live subtitles" with a tick when on.
- Permission: the system prompt appears on first start; if the tap returns silence or an error, show how to allow it in
  System Settings. Hidden below macOS 14.2. Without an AI provider set up, the bar shows the source line only and says
  why.
- verify: `bun run lint`, `cargo test`, `bun run build`; manual: start/stop from all three places; deny the
  permission once and see the guide.

### Phase 4 - Save to History (≈0.5 day)
- On stop, one History entry titled "<App> · <start time>" with the source text and the translation (same shape as a
  Files entry with a translation), only when at least one sentence was recognised.
- verify: Rust test for the entry text; manual: stop → entry appears, copy works.

### Phase 5 - Beta gates and docs (≈1 day)
- Real runs: YouTube in Chrome and Safari, a Zoom recording or test call, a podcast app; record delays and judge
  translation quality against the pass criteria.
- Product docs: `docs/product/ux/live-subtitles.md` + `logic/live-subtitles.md` (REQ prefix SE-LIVE), CHANGELOG,
  goal/releases; REQ-ID comments next to the evidence; `doc-index --check --product speakease` clean.
- verify: CI `app` + `rust` green on the branch sha, then FF push to main. **No release** until the owner says
  "phát hành".

Estimate: ≈7-9 working days end to end; Phase 0 decides whether the rest is worth it.

## Decisions

See `docs/product/decisions.md` (2026-10-16). Open for round 2 (ask after Phase 0 numbers): the bar's look and size,
the languages offered in the pickers, the shortcut's default key.

## Open risks

1. **Browsers play sound from helper processes** (Chrome's audio runs outside the main app process). Tapping only the
   main PID may give silence; the tap must include every process of that app. Checked first in Phase 0.
2. **Permission cannot be checked in advance**; a missing plist key yields silent buffers, not an error. Treat
   all-zero audio while the app is playing as "permission or tap problem" and say so.
3. **Hallucination on music or silence** ("Thank you." on quiet audio): only recognise segments VAD marks as speech.
4. **Prompt injection from what is played**: anything spoken goes into a prompt; keep it fenced and refuse to follow it.
5. **Cost**: about one AI call per sentence (~10-15 a minute of speech); show nothing about price in the beta but
   record call counts in the probe so the owner can judge.
6. **Load**: re-recognising the open segment every second keeps the GPU busy; measure in Phase 0 and lengthen the
   interval or switch to a smaller English model (Moonshine V2, 31 MB) if needed.
7. **macOS version**: taps exist from 14.2 (some sources say 14.4); confirm against Apple's docs in Phase 0 and gate
   on the confirmed version.

## Next safe step

Phase 0 probe on a branch: write the Swift tap and the probe flag, then run it once on the secondary screen against an
English YouTube video in Chrome. This shows the macOS audio-capture prompt on the owner's Mac, so start it only after
the owner says go.
