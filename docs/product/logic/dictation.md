---
id: speakease-logic-dictation
type: logic
product: speakease
title: "SpeakEase — Dictation (logic)"
status: active
updated: 2026-11-13
summary: "Rules for turning speech into text: language fallback, model suggestions measured on Vietnamese, and long audio split at pauses so nothing is dropped (SE-REC)."
tags: [area/audio, area/i18n, stack/rust]
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

| REQ-ID     | Rule (behaviour-changing)                                                                                                                                                                                                                                                                                                                                                                                                                                    | Status (live / not built / blocked) | Evidence (code path or test)                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SE-REC-001 | In the default "hold or toggle" activation, a key held past the hold threshold records until it is released.                                                                                                                                                                                                                                                                                                                                                 | live                                | `src-tauri/src/transcription_coordinator.rs` (`hold_or_toggle_long_hold_stops_on_release`)                                                                               |
| SE-REC-002 | In "hold or toggle", a short tap keeps recording until the next press.                                                                                                                                                                                                                                                                                                                                                                                       | live                                | `src-tauri/src/transcription_coordinator.rs` (`hold_or_toggle_tap_locks_recording_until_next_press`)                                                                     |
| SE-REC-003 | With Listen for = Auto and a model that cannot detect the language, Vietnamese and English are tried in turn: the language that last worked first, then the interface's, then Vietnamese; no other language is tried.                                                                                                                                                                                                                                        | live                                | `src-tauri/src/managers/transcription.rs` (`auto_without_detection_tries_both_languages_last_good_first`)                                                                |
| SE-REC-004 | A chosen language, or a model that detects the language itself, runs once (but see SE-REC-009); a model that knows neither Vietnamese nor English keeps the resolved language.                                                                                                                                                                                                                                                                               | live                                | `src-tauri/src/managers/transcription.rs` (`a_chosen_language_or_a_detecting_model_runs_once`)                                                                           |
| SE-REC-005 | When SpeakEase had to choose the language, the one that gave text is saved at once, so it is tried first next time, even if the app quits right after.                                                                                                                                                                                                                                                                                                       | live                                | `src-tauri/src/managers/transcription.rs` (`remember_spoken_language`)                                                                                                   |
| SE-REC-006 | For Vietnamese, only models measured on Vietnamese are suggested, best by word error rate first; "balanced" is within 1.5 points of the best and faster; "live" needs streaming; no model is suggested twice.                                                                                                                                                                                                                                                | live                                | `src/lib/utils/modelPicks.test.ts`                                                                                                                                       |
| SE-REC-007 | With no language chosen ("all"), no model is suggested.                                                                                                                                                                                                                                                                                                                                                                                                      | live                                | `src/lib/utils/modelPicks.test.ts`                                                                                                                                       |
| SE-REC-008 | Audio longer than 30 s is cut at its quietest moments into pieces of at most 30 s, each run on its own and joined in order; a piece the engine truncates is halved and run again: no stretch of speech is dropped, whatever the model. Applies to dictation, re-transcription and the command line.                                                                                                                                                          | live                                | `src-tauri/src/managers/transcription.rs` (`long_audio_is_cut_in_the_quiet_into_pieces_that_cover_it`)                                                                   |
| SE-REC-009 | With Listen for = Auto and translation off, when a model that detects the language reports one that is neither Vietnamese nor English on audio of at most 30 s, the audio is run once more in Vietnamese or English: the one last spoken, then the interface's, then Vietnamese. The second text is kept unless it is empty or the run fails. A Vietnamese or English pick is saved as the one last spoken. Longer audio and live preview are not run again. | live                                | `src-tauri/src/managers/transcription.rs` (`a_third_language_pick_is_run_again_in_vietnamese_or_english`; the second run itself, in `transcribe_reporting`, has no test) |
| SE-REC-010 | In a batch run (dictation that is not streamed live, re-transcription, files, the command line), custom words are handed to a transcribe-cpp model as its vocabulary when the loaded model formats one (Qwen3-ASR); a live streaming run does not pass them; the whisper family keeps them in its initial prompt, and other models get neither. The spelling correction after the run still applies to every model but Whisper.                              | live                                | `src-tauri/src/managers/transcription.rs` (`custom_words_become_the_vocabulary_only_where_the_model_formats_one`; no run with a real model)                              |
| SE-REC-011 | The on-device filter removes no Vietnamese word. "ờ", "ờm", "ừm" can be a hesitation or a real answer ("Ờ, được"), so Vietnamese fillers are removed only by the AI tidy step, which reads the sentence.                                                                                                                                                                                                                                                     | live                                | `src-tauri/src/audio_toolkit/text.rs` (`vietnamese_text_keeps_every_word_on_the_mac`)                                                                                    |

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

- 2026-11-13: SE-REC-011 - the owner first chose "ờ, ờm, ừm" for the on-device filter, then: "đùng sửa quá cứng
  nhắc nhé, quan trọng là phải sửa theo ngữ cảnh, sẽ có trường hợp ờ, ờm văn đúng trong câu." The list was taken
  out; Vietnamese fillers go to the AI tidy step only.
- 2026-11-13: SE-REC-009 and SE-REC-010 added (owner's form, round 2: fixes allowed before any measurement) - a
  third-language pick on Auto is run again in Vietnamese or English, and custom words reach Qwen3-ASR as its
  vocabulary. Neither is measured; SE-REC-004 now points to 009.
- 2026-10-14: SE-REC-008 added - long audio is split at silences (Cohere dropped the middle of a 70 s clip).
- 2026-10-11: created; REQ-IDs added as one-line comments next to the evidence in the same commit.
