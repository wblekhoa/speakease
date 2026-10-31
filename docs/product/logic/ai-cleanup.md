---
id: speakease-logic-ai-cleanup
type: logic
product: speakease
title: "SpeakEase — AI cleanup and translation (logic)"
status: active
updated: 2026-10-31
summary: "Rules for the AI steps after recognition: one AI switch, prompts, translation through English, skipped-step notices and output chips on the recording pill (SE-AI)."
tags: [area/ai, area/translation, stack/rust]
reqPrefix: SE-AI
relations:
  specifiedBy: [speakease-ux-ai-cleanup]
  implements:
    - speakease:src-tauri/src/actions.rs
    - speakease:src-tauri/src/settings.rs
    - speakease:src-tauri/src/shortcut/mod.rs
    - speakease:src/App.tsx
---

# SpeakEase — AI cleanup and translation (logic)

## Purpose

- Run the AI steps the user chose, in a fixed order, and never let an AI failure, refusal or injected instruction
  replace what the user said.
- Success signal: with AI off nothing runs; with AI on, the worst case is the raw transcript plus a notice.

## Rules

Status column: `live`, `not built`, or `blocked`. A live rule has its REQ-ID as a one-line comment next to the test
or code named in Evidence.

| REQ-ID    | Rule (behaviour-changing)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Status (live / not built / blocked) | Evidence (code path or test)                                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SE-AI-001 | When a prompt fences the transcript in `<transcript>` tags, the transcript is sent inside those tags, so instructions spoken in it are not obeyed.                                                                                                                                                                                                                                                                                                                                                                                                                                          | live                                | `src-tauri/src/actions.rs` (`a_fenced_template_gets_a_fenced_transcript`)                                                                                                              |
| SE-AI-002 | A short canned refusal from the model (English or Vietnamese) counts as no result and is never pasted; real text that merely contains such words is kept.                                                                                                                                                                                                                                                                                                                                                                                                                                   | live                                | `src-tauri/src/actions.rs` (`canned_refusals_are_not_pasted_but_real_text_is`)                                                                                                         |
| SE-AI-003 | When an AI step gives nothing back, the text so far is pasted and the window is told, which shows the "AI didn't run" notice; an empty transcript raises no notice.                                                                                                                                                                                                                                                                                                                                                                                                                         | live                                | `src-tauri/src/actions.rs` (`notify_ai_step_skipped`); `src/App.tsx` (`ai-step-skipped` listener)                                                                                      |
| SE-AI-004 | The main shortcut runs cleanup first, then translation; a target other than English goes through English (translate to English, then English to the target).                                                                                                                                                                                                                                                                                                                                                                                                                                | live                                | `src-tauri/src/actions.rs` (`quick_steps_tidy_before_they_translate`); `src-tauri/src/settings.rs` (`a_second_leg_exists_for_any_target`)                                              |
| SE-AI-005 | With Use AI off, neither the main shortcut's quick steps nor the translate shortcut run any AI step.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | live                                | `src-tauri/src/actions.rs` (`switching_ai_off_stops_the_speak_page_steps_too`)                                                                                                         |
| SE-AI-006 | The translate shortcut translates into the translate language - English until one is chosen - and keeps that language when the Speak page's translation is switched off.                                                                                                                                                                                                                                                                                                                                                                                                                    | live                                | `src-tauri/src/actions.rs` (`the_translate_shortcut_follows_the_translate_language`)                                                                                                   |
| SE-AI-007 | The translate shortcut is a default binding and, like dictate-with-AI, is registered only while AI is on; the main shortcut is always registered.                                                                                                                                                                                                                                                                                                                                                                                                                                           | live                                | `src-tauri/src/settings.rs` (`the_translate_shortcut_is_a_default_post_process_binding`)                                                                                               |
| SE-AI-008 | A settings store from before SpeakEase gets the SpeakEase prompts once (Vietnamese cleanup first, AI on); afterwards only the translate prompt is put back if missing, and the user's other choices survive.                                                                                                                                                                                                                                                                                                                                                                                | live                                | `src-tauri/src/settings.rs` (`a_handy_era_store_adopts_the_speakease_prompts_once`, `later_choices_survive_and_only_the_translate_prompt_comes_back`)                                  |
| SE-AI-009 | On that first adoption, a provider that already has an API key stays selected; otherwise the default provider is selected (Apple Intelligence on an Apple Silicon Mac).                                                                                                                                                                                                                                                                                                                                                                                                                     | live                                | `src-tauri/src/settings.rs` (`a_provider_with_a_key_is_kept`)                                                                                                                          |
| SE-AI-010 | Choosing a Speak-page translation target switches off the model's own translation into English, so the text is never translated twice.                                                                                                                                                                                                                                                                                                                                                                                                                                                      | live                                | `src-tauri/src/settings.rs` (`set_translate_target`)                                                                                                                                   |
| SE-AI-011 | While the recording pill listens, two icon buttons inside it (beside cancel) change the main shortcut's output for the dictation in progress: one moves to the next cleanup prompt (none → each prompt → none), the other turns translation into the translate language on or off. They write the Speak page's quick settings, so the next dictation, the Speak page and the tray show the same choice; choosing one while AI is off turns AI on; the new choice's name shows in place of the waveform for about a second. Clicking them does not take focus from the app being typed into. | live                                | `src/overlay/RecordingOverlay.tsx`                                                                                                                                                     |
| SE-AI-012 | On an Apple silicon Mac the AI can run on an on-device model: the "On-device model" provider needs no key, URL or model list; the AI page then lists the on-device models like the speech models (three picks, all ≤ 5 GB; heavier ones downloadable only), downloads them from a pinned revision with a sha256 check, and the bundled llama.cpp server starts with the chosen model on first use (its in-RAM prompt cache capped, so a long job stays near the model's listed RAM) and stops when idle, on quit and after a crash.                                                         | live                                | `src-tauri/src/local_ai.rs` (`catalog_parses_with_pins_and_picks`, `server_caps_its_prompt_cache`); `src-tauri/src/actions.rs`; `src/components/settings/post-processing/AiModels.tsx` |

## States and transitions

| State            | Trigger                        | Next state      | Edge case                                                                       |
| ---------------- | ------------------------------ | --------------- | ------------------------------------------------------------------------------- |
| AI off           | Use AI on                      | AI on           | the translate and dictate-with-AI shortcuts register again                      |
| AI on            | Use AI off                     | AI off          | AI shortcuts unregister; the Speak page shows "AI off"                          |
| transcript ready | steps = none                   | pasted as said  |                                                                                 |
| transcript ready | each step runs                 | AI text pasted  | a step that gives nothing is skipped; the next step starts from the text so far |
| step skipped     | at least one step gave nothing | pasted + notice | blank transcript: no step, no notice                                            |

## Fixed vs flexible

- Fixed (logic the UI must not change): one Use AI switch stops every AI step; cleanup before translation; non-English
  targets via English; a failed or refused step never loses the user's words; text, never audio, goes to a service.
- Flexible (UI may explore): wording and placement of quick choices, the prompts shipped, how the notice looks.

## Open questions

- None recorded.

## Change log

- 2026-10-31: SE-AI-012 - the bundled server's prompt cache in RAM is capped (`--cache-ram`); at llama-server's
  8 GiB default one long summary grew it to 9-11 GB.
- 2026-10-21: SE-AI-012 - on-device AI models through a bundled llama.cpp server (owner).
- 2026-10-20: reviewed after `post_process_transcription` was split so live subtitles can pass their own prompt (`post_process_with_prompt`) and a live-subtitles shortcut action joined `ACTION_MAP`; SE-AI rules unchanged.
- 2026-10-15: the output choices moved inside the recording pill as icon buttons.
- 2026-10-15: SE-AI-011 - output chips on the recording pill.
- 2026-10-14: reviewed after Files reused the AI step (`post_process_transcription` now crate-visible); no SE-AI rule changed, and the AI switch still gates Rewrite and Translate (`enhance_history_entry` refuses with "ai off").
- 2026-10-13: reviewed after `settings.rs` changed (an SE-APP-008 comment only); no SE-AI rule changed.
- 2026-10-11: created; REQ-IDs added as one-line comments next to the evidence in the same commit.
