---
id: speakease-logic-live-subtitles
type: logic
product: speakease
title: "SpeakEase — Live subtitles (logic)"
status: active
updated: 2026-10-20
summary: "Rules for live subtitles: hear one app through a process tap, cut lines at breaths, recognise on the Mac, translate with Apple Intelligence with playing-media context, re-join half-sentences, save to History (SE-LIVE)."
tags:
  [
    area/audio,
    area/capture,
    area/translation,
    area/ai,
    area/permissions,
    stack/rust,
    stack/swift,
  ]
reqPrefix: SE-LIVE
relations:
  specifiedBy: [speakease-ux-live-subtitles]
  implements:
    - speakease:src-tauri/src/live_subtitles.rs
    - speakease:src-tauri/src/system_audio_tap.rs
    - speakease:src-tauri/swift/system_audio_tap.swift
    - speakease:src-tauri/src/subtitle_window.rs
    - speakease:src/lib/liveSubtitles.ts
---

# SpeakEase — Live subtitles (logic)

## Purpose

- Subtitle any app's speech in the user's language while it plays, with nothing leaving the Mac.
- Success signal (beta gates, owner 16/10): translation on screen ≤ 3 s after a line ends (p95, measured with
  `--live-subtitle-probe`), faithful and natural, on YouTube, Zoom and a podcast app.

## Rules

Status column: `live`, `not built`, or `blocked`. A live rule has its REQ-ID as a one-line comment next to the test
or code named in Evidence.

| REQ-ID      | Rule (behaviour-changing)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Status (live / not built / blocked) | Evidence (code path or test)                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| SE-LIVE-001 | Live subtitles appear (side-column page, tray item) and their shortcut registers only with Experimental on and a Mac that can tap an app (macOS 14.2+, Apple silicon); turning Experimental off unregisters the shortcut and ends a running session.                                                                                                                                                                                                                                                                                                                                                                                                                                     | live                                | `src-tauri/src/settings.rs` (`binding_switched_off`), `src/components/settings/subtitles/LiveSubtitlesPage.tsx`                |
| SE-LIVE-002 | The tap hears the chosen app and every process it is responsible for or whose bundle id extends its own (browser helpers, `com.apple.WebKit.GPU`), never SpeakEase's own processes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | live                                | `src-tauri/swift/system_audio_tap.swift` (`belongsToApp`)                                                                      |
| SE-LIVE-003 | A line closes after 400 ms of silence; once 2.5 s long, at a 150 ms breath; at 6 s, at the quietest frame of its last 1.5 s, the rest starting the next line; bursts with under 300 ms of speech are dropped; 300 ms before speech is kept.                                                                                                                                                                                                                                                                                                                                                                                                                                              | live                                | `src-tauri/src/live_subtitles.rs` (segmenter tests)                                                                            |
| SE-LIVE-004 | Lines are translated on the Mac only, by Apple Intelligence with its content-transformation guardrails and plain text output; when it is unavailable or declines, the source line stays without a translation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | live                                | `src-tauri/src/live_subtitles.rs` (`translate_on_device`), `src-tauri/swift/apple_intelligence.swift` (`transform_text_apple`) |
| SE-LIVE-005 | A waiting line is always translated before a re-joined sentence or the topic note; those run only when no line waits, and are dropped when the session stops.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | live                                | `src-tauri/src/live_subtitles.rs` (`translate_lines`)                                                                          |
| SE-LIVE-006 | A line with no final punctuation, or ending on a function word ("and."), waits for the line that completes it; the joined sentence (at most 3 lines or 45 words) is translated once more and replaces the pieces' translations.                                                                                                                                                                                                                                                                                                                                                                                                                                                          | live                                | `src-tauri/src/live_subtitles.rs` (joiner test), `src/lib/liveSubtitles.test.ts`                                               |
| SE-LIVE-007 | The translation prompt carries what is playing (the titled window or open document of the app instance that plays, cleaned of browser and profile names), a topic-and-names note the AI writes from the last 12 lines after 6 lines and then every 20, and the last 2 lines; the line and all of these are fenced and never obeyed.                                                                                                                                                                                                                                                                                                                                                      | live                                | `src-tauri/src/live_subtitles.rs` (prompt and playing-note tests)                                                              |
| SE-LIVE-008 | The panel reads like a chat: one bubble per line, newest at the bottom, the translation as the main text and what was heard under it (dots while it is being translated); the last 60 lines can be scrolled back; it follows the newest line unless the user scrolled up, then offers a jump back; a line being heard shows as a partial about once a second while the recogniser is idle; a re-joined sentence takes the place of its pieces. The window grows with its content to show at most 4 bubbles (measured at their own heights), keeping its bottom edge; lines beyond fade out at the edge they continue past (top while older lines are above, bottom while scrolled back). | live                                | `src/lib/liveSubtitles.test.ts`, `src/subtitles/LiveSubtitles.tsx`                                                             |
| SE-LIVE-009 | When a session ends with something heard, one History entry is saved: title from what was playing or the app name, the heard lines as the transcript, their translations (one per re-joined sentence) as the AI version; no audio is kept.                                                                                                                                                                                                                                                                                                                                                                                                                                               | live                                | `src-tauri/src/live_subtitles.rs` (session test), `src-tauri/src/managers/history.rs` (`save_subtitle_entry`)                  |
| SE-LIVE-010 | The tray item and the shortcut stop a running session, or start one with the app and languages used last; with no app remembered they open the Live subtitles page.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | live                                | `src-tauri/src/live_subtitles.rs` (`toggle`)                                                                                   |
| SE-LIVE-011 | The panel has two switches: **Translate** - off, no AI call is made from the next line on (no translation, re-join or topic note), new lines show as heard, and the choice is remembered for later sessions; **Original** - shows or hides what was heard under each translation, remembered on this Mac, and always shown while Translate is off.                                                                                                                                                                                                                                                                                                                                       | live                                | `src-tauri/src/live_subtitles.rs` (`translate_lines`, `set_translate`), `src/subtitles/LiveSubtitles.tsx`                      |

## States and transitions

| State         | Trigger                                               | Next state    | Edge case                                           |
| ------------- | ----------------------------------------------------- | ------------- | --------------------------------------------------- |
| off           | start (card, tray, shortcut)                          | getting ready | nothing remembered (tray/shortcut) → Speak opens    |
| getting ready | model loaded, warm-up done, app's audio process found | listening     | the app plays nothing for 30 s → error `no-process` |
| listening     | speech                                                | lines         | all-zero audio → permission or Info.plist problem   |
| any running   | stop (card, ×, tray, shortcut, Experimental off)      | off           | last lines finish; History entry saved              |

## Fixed vs flexible

- Fixed: on-device translation only; one app at a time; the History entry; every app-sourced text fenced in prompts.
- Flexible: line-cut timings, partial cadence, topic-note cadence, the bar's size and look, the default shortcut.

## Open questions

- Phase 5 runs on Zoom and a podcast app are not done yet (plan).
- A local translation model for Macs without Apple Intelligence (owner allowed; needs a new dependency, to propose).

## Change log

- 2026-10-20: SE-LIVE-008 - the panel shows at most 4 bubbles with faded edges (owner); it had been stuck at its opening height.
- 2026-10-20: SE-LIVE-011 - Translate and Original switches on the panel (owner).
- 2026-10-20: SE-LIVE-008 changed again - a chat-like panel of bubbles that scrolls back through the session (owner's reference UI).
- 2026-10-20: SE-LIVE-008 changed - the bar rolls through the last 3 lines instead of one pair (owner: one line was replaced before it could be read).
- 2026-10-20: the controls moved to their own page; tray and shortcut open it when nothing is remembered.
- 2026-10-20: created with SE-LIVE-001…010 and REQ-ID comments next to the evidence.
