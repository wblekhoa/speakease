---
status: executing
owner: Lê Khoa
started: 2026-10-16
current-phase: 5
summary: "Beta of live translated subtitles: capture one app's sound, recognise it on the Mac, translate each sentence with the app's AI, show a bilingual floating bar, behind the Experimental switch."
tags:
  [
    area/audio,
    area/capture,
    area/translation,
    area/ai,
    area/permissions,
    stack/swift,
    stack/rust,
    stack/tauri,
    surface/macos,
  ]
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

## Phase 0 results (20/10/2026)

Quiet test (Stage A): `afplay` reading a 51 s English text with known words, muted on the speakers while tapped,
probe built and signed with the Developer ID, launched with `open -n -a <bundle> --args --live-subtitle-probe <pid>
--probe-mute`. Raw lines: scratchpad `stageA1.jsonl` (not kept in the repo).

- Tap: works, audio non-silent (peak 0.79), no permission prompt shown for this run; 10/10 sentences in order.
- Source line: p50 0.78 s, p95 1.12 s after the end of speech (gate ≤ 1.5 s: **pass**).
- Translation: p50 1.84 s; p95 5.71 s only because the first AI call took 4.76 s (connection set-up); the other nine
  were 1.29-3.25 s. Gate p95 ≤ 3 s: **pass once the first call is paid before the first sentence** - the probe now
  sends a warm-up call before tapping (1.76 s in the next run).
- Recognition words: near-perfect ("organisers" → "organizer").
- Translation quality: natural, but "Friday" became "thứ Năm" (Thursday) and "players" became "cầu thủ" (football)
  where esports needs "tuyển thủ". Prompt now says to keep days, dates and numbers exactly; the second needs the
  topic as context - for round 2 / Phase 1.
- First ~4.5 s of the clip were missed (the first sentence came out as its last words). The probe now logs when the
  first chunk and the first sound arrive to tell tap start-up time from the clip starting before the tap.

Finding for risk 1: WebKit apps (Safari, apps with a web view) play through a shared `com.apple.WebKit.GPU` process
whose bundle id does not name the app, and Chromium apps through `*.helper`. The tap now also takes every process the
chosen app is **responsible for** (`responsibility_get_pid_responsible_for_pid`); checked: two `WebKit.GPU`
processes resolved to SpeakEase and Google Drive, Chrome's helpers to Chrome. SpeakEase's own processes are excluded.

Second quiet run (Stage A2, same clip, new build): 10/10 sentences **including the first** (the 4.5 s gap was a
first-run effect: audio now arrives 19 ms after the tap starts); warm-up call 1.21 s; source line p50 0.70 s / p95
0.93 s; translation p50 1.66 s / **p95 2.74 s** - both gates pass. "Friday" → "thứ Sáu" (correct now); "players" →
"cầu thủ" remains.

Stage B (20/10, the owner played an English YouTube narration in Chrome; tapped `com.google.Chrome.helper`, not
muted, 120 s each; translator = Apple Intelligence on the Mac, the AI set up in the app):

| Run                                                                       | Lines | Cut at the limit | Source p50/p95 | Translation p50/p95 | First word → Vietnamese (median / max) | AI gave nothing |
| ------------------------------------------------------------------------- | ----- | ---------------- | -------------- | ------------------- | -------------------------------------- | --------------- |
| B1: 400 ms pause, 12 s limit                                              | 15    | 7                | 0.84 / 2.24 s  | 4.10 / 7.25 s       | 14.2 / 19.3 s                          | 2               |
| B2: + cut at a 150 ms breath after 2.5 s, 6 s limit at the quietest frame | 30    | 3                | 0.51 / 1.52 s  | 1.81 / 3.93 s       | 5.5 / 9.2 s                            | 3               |

- B1 failed: the narrator hardly pauses, so lines filled the 12 s limit and words were cut mid-word ("che…").
- B2 is close: translation p95 3.9 s against the 3 s gate - the three slow lines are the ones cut at the limit.
- Apple Intelligence refused 3 of 30 ordinary lines with "safety guardrails were triggered" ("an undefended wallet on
  the street", "three disastrous days") - 10 % of lines lost. Product needs a fallback (show the source line) and the
  owner may prefer a cloud provider for subtitles.
- Short lines are often half-sentences ("By many, driving growth, spending, and of course."), which hurts meaning;
  recognition slips pass straight through ("prize pool" → "price pull" → "Tổng giá trị kéo", "Krafton" → "Crafton",
  "9/11/2026" → a wrong date).

### Round 2 applied (20/10)

Owner decisions are in `decisions.md` (2026-10-20). Built into the probe:

- Translation through Apple Intelligence with the content-transformation guardrails (`transform_text_apple` in
  `swift/apple_intelligence.swift`), plain text, no cloud provider.
- `SentenceJoiner`: a line that ends mid-sentence (no final punctuation, or a final function word such as "and.") is
  kept; the line that completes it triggers one more translation of the whole sentence, which replaces the pieces
  (at most 3 lines / 45 words).
- Context: the tapped app's titled window and open document (Accessibility; the instance that plays wins when an app
  runs twice - this Mac runs two Chrome profiles), cleaned into a "what is playing" note; plus a topic-and-names note
  the AI writes from the last 12 lines after 6 lines, then every 20.

| Run                | Lines | AI gave nothing  | Translation p50/p95 | Re-joined | Notes                                                                                                         |
| ------------------ | ----- | ---------------- | ------------------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| B3 (Chrome, 120 s) | 27    | **0** (was 3/30) | 2.08 / 3.41 s       | 1         | topic note named Soupy, Oa, Hiyama, Tanvu; window title came back empty (wrong Chrome instance - fixed after) |

Open after B3: p95 3.4 s is above the 3 s gate because a re-join or topic call holds up the next line (the on-device
model answers one at a time); "stream snipe" was translated as "bắn xuyên màn hình" (should stay a term); the joiner
rarely fires because the recogniser ends most half-sentences with a full stop.

### Phases 1-4 built (20/10)

- Phase 1: `live_subtitles::pipeline` shared by the probe and the app session; new lines are translated before
  re-joins and the topic note (SE-LIVE-005); partial source lines about once a second while the recogniser is idle.
- Phase 2: the floating bar (`subtitle_window.rs`, `src/subtitles/`), non-activating panel, draggable, position kept.
- Phase 3: the Speak card (behind Experimental), tray item, shortcut ⌃⌥⌘S (registers only with Experimental on).
- Phase 4: one History entry per session (`save_subtitle_entry`).
- Docs: `docs/product/ux/live-subtitles.md`, `docs/product/logic/live-subtitles.md` (SE-LIVE-001…010).
- Not yet measured in the app: the delay with the priority fix, Zoom and a podcast app (Phase 5).

## Next safe step

Phase 0 probe on a branch: write the Swift tap and the probe flag, then run it once on the secondary screen against an
English YouTube video in Chrome. This shows the macOS audio-capture prompt on the owner's Mac, so start it only after
the owner says go.
