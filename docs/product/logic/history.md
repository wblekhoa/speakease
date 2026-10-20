---
id: speakease-logic-history
type: logic
product: speakease
title: "SpeakEase — History (logic)"
status: active
updated: 2026-10-20
summary: "Rules for History: Vietnamese case-insensitive search across both texts, counters on the delivered text, and the original always shown (SE-HIST)."
tags: [area/search, area/storage, stack/sqlite]
reqPrefix: SE-HIST
relations:
  specifiedBy: [speakease-ux-history]
  implements:
    - speakease:src-tauri/src/managers/history.rs
    - speakease:src-tauri/src/commands/history.rs
    - speakease:src/components/settings/history/HistorySettings.tsx
---

# SpeakEase — History (logic)

## Purpose

- Keep every dictation findable and honest: the user can always see what they said, not only what AI made of it.
- Success signal: search finds Vietnamese words regardless of capitals; counters reflect the text the user received.

## Rules

Status column: `live`, `not built`, or `blocked`. A live rule has its REQ-ID as a one-line comment next to the test
or code named in Evidence.

| REQ-ID      | Rule (behaviour-changing)                                                                                                                                                                     | Status (live / not built / blocked) | Evidence (code path or test)                                                              |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------- |
| SE-HIST-001 | Search ignores case, including Vietnamese capitals ("Đ" matches "đ"), requires every typed word to appear, and searches both the original and the AI version.                                 | live                                | `src-tauri/src/managers/history.rs` (`search_folds_vietnamese_case_and_needs_every_word`) |
| SE-HIST-002 | Counters count dictations and the words of the text the user got (the AI version when there is one); minutes saved = words / 40 − words / 150 (typing versus speaking speed), rounded to 0.1. | live                                | `src-tauri/src/managers/history.rs` (`stats_count_the_text_the_user_got`)                 |
| SE-HIST-003 | A card with an AI version also shows the original transcript under it.                                                                                                                        | live                                | `src/components/settings/history/HistorySettings.tsx` (`endsOnOriginal`)                  |

## States and transitions

| State         | Trigger                 | Next state      | Edge case                           |
| ------------- | ----------------------- | --------------- | ----------------------------------- |
| list          | type a query            | filtered list   | blank query shows everything        |
| filtered list | no entry has every word | no matches      |                                     |
| card          | Re-transcribe           | re-transcribing | failure keeps the card with a retry |
| card          | Delete                  | removed         |                                     |

## Fixed vs flexible

- Fixed (logic the UI must not change): search covers both texts and needs every word; counters use the delivered
  text; the original is never hidden behind the AI version.
- Flexible (UI may explore): card layout, grouping, badge wording, counter presentation.

## Open questions

- None recorded.

## Change log

- 2026-10-20: reviewed after `save_subtitle_entry` was added for live subtitles (one entry per session, no audio, `file-` prefix; rule SE-LIVE-009); SE-HIST rules unchanged.
- 2026-10-14: reviewed after file entries and the card's Rewrite or translate button (SE-FILE-002/003); SE-HIST-001…003 unchanged - the original still shows under any AI version.
- 2026-10-11: created; REQ-IDs added as one-line comments next to the evidence in the same commit.
