---
id: speakease-ux-meetings
type: ux
product: speakease
title: "SpeakEase — Meeting notes (UX)"
status: active
updated: 2026-10-31
summary: "Beta behind Experimental: a shortcut or the tray records the meeting app and the microphone, a bar at the top of the screen shows the consent line, a timer and Stop, and the meeting lands in History with its notes written in the background."
tags: [area/ai, area/audio, area/capture, surface/macos, stack/react]
relations:
  specifies:
    - speakease:src/meeting/MeetingBar.tsx
    - speakease:src/components/settings/meetings/MeetingsPage.tsx
    - speakease:src-tauri/src/meeting.rs
    - speakease:src-tauri/src/tray.rs
  dependsOn: [speakease-logic-meetings]
  sharesSurfaceWith:
    [speakease-ux-dictation, speakease-ux-history, speakease-ux-live-subtitles]
---

# SpeakEase — Meeting notes (UX)

> Feature master: read this file first to understand how a user records a call and gets notes from it.
> Rules live in `logic/meetings.md`; the build order in `ai-memory/plans/meeting-notes-build.md`.

## Purpose

- Problem: after a call, lecture or interview the user has to remember or rewrite what was said, decided and promised.
- Audience: the owner first, then anyone who turns on App › Experimental (beta).
- Success signal: one shortcut at the start of a call, one at the end, and the notes are in History minutes later, with
  nothing invented for a call that had nothing in it.

## Scope

- Included (phase 2): the shortcut on Recording, the tray item, the meeting bar, the History entry with its notes.
- Also included (phase 3): the Meetings page (list, notes, transcript, template menu, copy, save .md / .txt).
- Not yet (phases 4-5): asking whether to take notes when a call starts, live transcript and help,
  the meeting chat, export. Dictation itself is `ux/dictation.md`.

## Current truth

- **Where it lives**: with App › Experimental on (macOS 14.2+), Recording lists a **Meeting notes** shortcut
  (⌃⌥⌘M by default) and the tray gains a **Meeting notes** item with a tick while a meeting records.
- **Starting**: the shortcut or tray item records the call app that is running (Zoom, Teams, Zalo, Messenger,
  FaceTime, Slack, Discord), playing sound first, else the app used last time, else a browser playing sound; and the
  microphone picked for dictation, as its own stream. No dictation starts.
- **Meeting bar**: a pill at the top centre of the screen that never takes focus from the call: a pulsing red dot,
  "Đang ghi âm. Nhớ báo cho mọi người biết nhé." (EN "Recording. Remember to tell everyone."), a timer and **Stop**.
  It asks macOS to keep it out of screen sharing (untested).
- **During the meeting**: dictation works as usual; what is dictated stays in the meeting's transcript, marked.
- **Ending**: the shortcut, the tray item or **Stop**. The bar then says "Đang chép lời cuộc họp…", then "Đang viết
  ghi chú…", and hides when the meeting is saved.
- **Result**: one History entry titled "<app> · dd/mm HH:MM" with the transcript (Tôi / Người khác, in time order)
  and the mixed audio; its notes are stored beside it.
- **Meetings page**: with Experimental on, the side column gains **Meetings** under Live subtitles. Left: meetings,
  newest first, each with its app, "dd/mm HH:MM" and length. Right: the meeting's title with **Copy**, **Save .md**
  and **Save .txt**; then **Notes** / **Transcript** and the template menu (Meeting, Call, Lecture, Interview) -
  choosing another writes the notes again in the background. Notes open with "AI wrote these notes. Check names and
  numbers against the transcript." and a link to the transcript. With no AI the page says why (AI off, or nothing
  on this Mac) and shows the transcript; an empty recording shows its one line; failed notes show the transcript.
  A saved file holds the notes, then the transcript; Copy takes the tab in view.
- **Errors** (on the bar, with ×): macOS too old; no call app running; already recording; the microphone could not
  open; no speech model; the speech detector did not start.

## Screens and states

| Screen        | States                                                                      | Entry                         | Exit / next                                |
| ------------- | --------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------ |
| Meeting bar   | recording · transcribing · notes · error                                    | shortcut, tray                | Stop / shortcut / tray; × on error         |
| Tray item     | hidden · off · on (ticked)                                                  | tray menu (Experimental on)   | starts or stops                            |
| Meetings page | none yet · notes · writing · empty · no AI · failed; Notes / Transcript tab | side column (Experimental on) | another meeting, template menu, copy, save |

## Flow

1. The user joins a call and presses ⌃⌥⌘M (or ticks the tray item).
2. The bar appears with the consent line; the user tells the others they are recording.
3. At the end the user presses Stop; the bar shows the background work, then hides.
4. The meeting is in History and on the Meetings page; with no AI available the page says why and the transcript is
   the record.
5. The user reads the notes, checks a name against the transcript, and saves them as .md.
