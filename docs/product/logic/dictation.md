---
id: speakease-logic-dictation
type: logic
product: speakease
title: "SpeakEase — Dictation (logic)"
status: active
updated: 2026-10-11
reqPrefix: SE-REC
relations:
  specifiedBy: [speakease-ux-dictation]
  implements:
    - speakease:src-tauri/src/transcription_coordinator.rs
    - speakease:src-tauri/src/managers/transcription.rs
    - speakease:src/lib/utils/modelPicks.ts
    - speakease:src/lib/utils/vietnameseModels.ts
---

# SpeakEase — Dictation (logic)

## Purpose

- Turn a key press into text in the right language, without making the user think about modes or models.
- Success signal: Vietnamese speech never comes back as a failed English run; the suggested model is the one that
  hears Vietnamese best.

## Rules

Status column: `live`, `not built`, or `blocked`. A live rule has its REQ-ID as a one-line comment next to the test
or code named in Evidence.

| REQ-ID     | Rule (behaviour-changing)                                                                                                                                                                                             | Status (live / not built / blocked) | Evidence (code path or test)                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| SE-REC-001 | In the default "hold or toggle" activation, a key held past the hold threshold records until it is released.                                                                                                          | live                                | `src-tauri/src/transcription_coordinator.rs` (`hold_or_toggle_long_hold_stops_on_release`)                |
| SE-REC-002 | In "hold or toggle", a short tap keeps recording until the next press.                                                                                                                                                | live                                | `src-tauri/src/transcription_coordinator.rs` (`hold_or_toggle_tap_locks_recording_until_next_press`)      |
| SE-REC-003 | With Listen for = Auto and a model that cannot detect the language, Vietnamese and English are tried in turn: the language that last worked first, then the interface's, then Vietnamese; no other language is tried. | live                                | `src-tauri/src/managers/transcription.rs` (`auto_without_detection_tries_both_languages_last_good_first`) |
| SE-REC-004 | A chosen language, or a model that detects the language itself, runs once; a model that knows neither Vietnamese nor English keeps the resolved language.                                                             | live                                | `src-tauri/src/managers/transcription.rs` (`a_chosen_language_or_a_detecting_model_runs_once`)            |
| SE-REC-005 | When SpeakEase had to choose the language, the one that gave text is saved at once, so it is tried first next time, even if the app quits right after.                                                                | live                                | `src-tauri/src/managers/transcription.rs` (`remember_spoken_language`)                                    |
| SE-REC-006 | For Vietnamese, only models measured on Vietnamese are suggested, best by word error rate first; "balanced" is within 1.5 points of the best and faster; "live" needs streaming; no model is suggested twice.         | live                                | `src/lib/utils/modelPicks.test.ts`                                                                        |
| SE-REC-007 | With no language chosen ("all"), no model is suggested.                                                                                                                                                               | live                                | `src/lib/utils/modelPicks.test.ts`                                                                        |

## States and transitions

| State              | Trigger                                | Next state                       | Edge case                                                                 |
| ------------------ | -------------------------------------- | -------------------------------- | ------------------------------------------------------------------------- |
| idle               | dictation shortcut pressed             | recording                        | no model ready → error toast, stays idle                                  |
| recording (held)   | key released after the threshold       | transcribing                     | key auto-repeat counts as one long hold                                   |
| recording (tapped) | next press                             | transcribing                     | release of the tapping key is ignored                                     |
| recording          | Esc                                    | idle                             | nothing is pasted; the next press starts a fresh recording                |
| transcribing       | text produced                          | pasting (after AI steps, if any) | Auto without detection: an empty run in one language retries in the other |
| transcribing       | nothing usable in every language tried | idle (error toast)               | the recording stays in History for re-transcription                       |

## Fixed vs flexible

- Fixed (logic the UI must not change): only Vietnamese and English are auto-tried; a chosen language runs once;
  Vietnamese suggestions come from measurements, not catalog scores.
- Flexible (UI may explore): shortcut defaults, the Speak page layout, how suggestions and the Auto hint are shown.

## Open questions

- None recorded.

## Change log

- 2026-10-11: created; REQ-IDs added as one-line comments next to the evidence in the same commit.
