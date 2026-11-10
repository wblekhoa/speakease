---
id: speakease-ux-history
type: ux
product: speakease
title: "SpeakEase — History (UX)"
status: active
updated: 2026-11-10
summary: "How past dictations and files are found and reused: search, counters, cards with the original under the AI version, playback, rewrite or translate, storage."
tags: [area/search, area/storage, stack/react]
relations:
  specifies: [speakease:src/components/settings/history/HistorySettings.tsx]
  dependsOn: [speakease-logic-history]
---

# SpeakEase — History (UX)

> Feature master: read this file first to understand how a user finds, reuses and checks past dictations. Deeper
> rules live in `logic/history.md`.

## Purpose

- Problem: a dictation pasted into the wrong window, or cleaned up wrongly by AI, is lost unless the app keeps it.
- Audience: every user, after a dictation went somewhere unexpected or needs reusing.
- Success signal: the user finds a past dictation by a word they remember, and can see what they actually said
  under the AI version.

## Scope

- Included: the History section - search, counters, cards per dictation (AI version, original, badges), playback,
  copy, save, delete, re-transcribe, Storage settings.
- Excluded: making a dictation (`ux/dictation.md`), the AI steps themselves (`ux/ai-cleanup.md`).

## Current truth

- **Search** ("Search what you said") matches every word typed, in any case - "đà NẴNG" finds "Đà Nẵng" - in both
  the original and the AI version. No match shows "No matches".
- **Counters** at the top: dictations and words, each with an icon and how many were added today, and the minutes of
  typing saved beside one bar per day for the last 14 days (today is the solid bar, days without dictation are grey stubs, hover a bar for its date and minutes; screen readers get the same list). The counters reload when the window regains focus, so "today" moves on after midnight.
- **One card per dictation**, grouped by Today / Yesterday / date. A card with an AI version shows it first, with an
  **AI** or **Translated** badge, and the **Original** in an inset box under it.
- Per card: **Play back** the recording, **Copy**, **Save** (kept beyond the limit), **Rewrite or translate** (the AI
  & Translate prompts and the Speak page's languages, shown in the card; `logic/files.md` SE-FILE-003), **Delete**, **Re-transcribe**
  (useful after switching model or language).
- **Your own instruction**: the Rewrite menu also has a box for a free instruction ("replace “diu tub” with YouTube",
  "write it as a short message to the team"); **Rewrite** or Enter runs it on the text the card shows, and the
  Original stays under it. The last five instructions sit under the box as buttons to run again, each with a ✕ to
  remove it (`logic/ai-cleanup.md` SE-AI-013).
- **Storage** sets how many dictations are kept and when recordings are deleted. Everything stays on the Mac.

## Screens and states

| Screen  | States                                                                                      | Entry             | Exit / next         |
| ------- | ------------------------------------------------------------------------------------------- | ----------------- | ------------------- |
| History | loading · empty ("No transcriptions yet…") · list · search with results · no matches        | sidebar › History | another section     |
| Card    | plain · with AI version + Original · re-transcribing · transcription failed (retry) · saved | History list      | actions on the card |
| Storage | history limit · recording retention period                                                  | History › Storage | back to the list    |

## Flow

```mermaid
flowchart LR
  A[Open History] --> B[Counters + cards, newest first]
  B --> C[Type in search]
  C --> D{Every word found in original or AI text?}
  D -- yes --> E[Matching cards]
  D -- no --> F[No matches]
  E --> G[Copy / Play back / Re-transcribe / Save / Delete]
```

## Reading order

| File               | Role            |
| ------------------ | --------------- |
| this file          | current truth   |
| `logic/history.md` | rules + REQ-IDs |

## Change log

- 2026-11-10: counters got icons, today's additions and a 14-day bar chart of minutes saved (owner picked A + B).
- 2026-11-10: a box for the user's own rewrite instruction, with the last five kept (owner form).
- 2026-10-14: Rewrite or translate on every card; file entries show their name and fold to six lines.
- 2026-10-11: created (doc-engine rollout).
