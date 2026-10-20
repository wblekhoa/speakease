---
id: speakease-ux-live-subtitles
type: ux
product: speakease
title: "SpeakEase — Live subtitles (UX)"
status: active
updated: 2026-10-20
summary: "Beta behind Experimental: pick one app, the language it speaks and the one to read, and a floating bilingual bar subtitles it live, translated on the Mac; the session lands in History."
tags: [area/audio, area/capture, area/translation, surface/macos, stack/react]
relations:
  specifies:
    - speakease:src/components/settings/subtitles/LiveSubtitlesPage.tsx
    - speakease:src/subtitles/LiveSubtitles.tsx
    - speakease:src-tauri/src/tray.rs
  dependsOn: [speakease-logic-live-subtitles]
  sharesSurfaceWith:
    [speakease-ux-dictation, speakease-ux-history, speakease-ux-app-shell]
---

# SpeakEase — Live subtitles (UX)

> Feature master: read this file first to understand how a user subtitles another app's speech in their own language.
> Deeper rules live in `logic/live-subtitles.md`; the beta plan and its measurements in
> `ai-memory/plans/live-subtitles-beta.md`.

## Purpose

- Problem: a video, call or podcast in a language the user follows slowly; YouTube's own captions cover only YouTube
  and translate line by line without the topic.
- Audience: the owner first, then anyone who turns on App › Experimental (beta).
- Success signal: the translation of a line is on screen within 3 s of the speaker finishing it, reads naturally, and
  works for YouTube in a browser, Zoom and a podcast app.

## Scope

- Included: the Live subtitles page, the floating bar, the tray item, the shortcut on Recording, the History
  entry a session leaves.
- Excluded: dictation (`ux/dictation.md`); the History page itself (`ux/history.md`); cloud translation (owner,
  20/10: on-device only).

## Current truth

- **Where it lives**: with App › Experimental on, the side column gains **Live subtitles** between Files & links and
  History - its own page, because it is used differently from dictation (another app's sound, not your voice).
  Recording lists a **Live subtitles** shortcut (⌃⌥⌘S by default); the tray gains a **Live subtitles** item with a tick
  while it runs. On macOS older than 14.2 the page says it needs 14.2.
- **Page**: a top block with the state ("Ready to subtitle Google Chrome", "Subtitling Google Chrome", or an error in
  plain words), the shortcut, and **Turn on subtitles** / **Turn off subtitles**; then **Listen to** - running apps
  as a list to pick from, those playing sound first with a "playing" mark; then **Languages** - the spoken language
  → the one to read (the shared translate language unless that is the spoken one); four short notes (on-device, reads the title for context, saved to History, the one-time permission) sit behind an info icon beside the title, and the list's hint behind one beside **Listen to**. The choices lock while subtitles run.
- **Panel**: a floating column in the bottom-right corner of the screen with the pointer, 472 px wide (bubbles 440 px, room for their shadows), with no box behind it: each bubble floats on its own, nearly solid so text reads over a busy video, that never
  takes focus from the app being watched: clicking it (a switch, ×, a drag) does not bring SpeakEase's window
  forward, and it comes to the front of every window when subtitles start. At its top a small pill shows a breathing dot, the app's name, two switches -
  **Translate** (off: no AI, lines show as heard) and **Original** (show or hide what was said under each
  translation) - and **×** (turn subtitles off); drag the pill or the bubbles to move it, and it opens there next time. Each line is its own
  rounded bubble, like a chat: the translation in larger text, what was said under it in small grey text, or three
  soft dots while it is being translated. The newest bubble is at the bottom; when a sentence spans two lines, one
  bubble with the whole sentence takes their place. The panel grows upward to show at most four bubbles, then scrolls, the
  older lines fading out at its top edge (and at the bottom while you read back); it follows the newest line unless the user scrolls up to read, and a round **↓** button brings it back.
  The last 60 lines stay to scroll through. After 8 s of silence it fades a little.
- **Before the first line**: a bubble says "Getting subtitles ready…", then "Listening to <app>…".
- **Ending**: from the card, the bar's ×, the tray or the shortcut. What was heard is saved to History as one entry,
  titled with what was playing (a YouTube video's title, a file's name) or the app's name, with the translation as
  its AI version.
- **Tray and shortcut**: start with the app and languages used last; with none yet, they open the Live subtitles page.
- **Errors** (card line or bar): macOS too old; no recognition model; the app played nothing for 30 s; SpeakEase may
  not record system audio (with where to allow it); the speech detector did not start.
- **Permission**: the first start asks macOS for "record system audio" for SpeakEase; Accessibility, already granted
  for pasting, lets it read the app's window title for context.

## Screens and states

| Screen              | States                                                                               | Entry                                                                | Exit / next                                             |
| ------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------- |
| Live subtitles page | unsupported · no app chosen · ready · running · error                                | side column (Experimental on), tray/shortcut with nothing remembered | bar                                                     |
| Panel               | getting ready · listening · lines · scrolled back (↓ shown) · quiet (dimmed) · error | start from the page, tray, shortcut                                  | ×, page, tray, shortcut → History entry                 |
| Tray item           | hidden · off · on (ticked)                                                           | tray menu                                                            | starts or stops; opens Speak when nothing is remembered |

## Flow

```mermaid
flowchart LR
  A[Experimental on] --> B[Live subtitles page: pick app + languages]
  B --> C[Turn on subtitles]
  C --> D[Panel: listening]
  D --> E[Lines + translations]
  E --> F{Stopped?}
  F -- card, x, tray, shortcut --> G[History entry]
  T[Tray / shortcut] -- remembered choice --> D
```

## Reading order

| File                                     | Role                                |
| ---------------------------------------- | ----------------------------------- |
| this file                                | current truth                       |
| `logic/live-subtitles.md`                | rules + REQ-IDs (SE-LIVE-…)         |
| `ai-memory/plans/live-subtitles-beta.md` | plan, measurements, open work       |
| `decisions.md`                           | owner rounds 1 and 2 (16/10, 20/10) |

## Change log

- 2026-10-20: clicking the panel no longer raises SpeakEase's window; the panel comes to the front when subtitles start (owner).
- 2026-10-20: no box around the bubbles; each bubble floats on its own, nearly solid (owner).
- 2026-10-20: a strong native blur behind the panel and softer bubble shadows (owner).
- 2026-10-20: bubble shadows no longer cut at the panel's edges (owner).
- 2026-10-20: at most four bubbles show, with faded edges (owner).
- 2026-10-20: Translate and Original switches in the panel's pill (owner).
- 2026-10-20: the bar became a chat-like panel of bubbles in the bottom-right corner (owner's reference UI).
- 2026-10-20: the bar rolls through the last three lines (owner: one line went by before it could be read).
- 2026-10-20: the page's descriptions moved behind info icons (owner).
- 2026-10-20: moved from a card on Speak to its own page in the side column (owner: its UX differs from dictation).
- 2026-10-20: created - the card, the bar, tray item and shortcut, History entry (beta, behind Experimental).
