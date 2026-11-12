---
id: speakease-ux-meetings
type: ux
product: speakease
title: "SpeakEase — Meeting notes (UX)"
status: active
updated: 2026-11-12
summary: "Beta open to every Mac on macOS 14.2+: a Start button in the Meetings page's bottom bar, a shortcut or the tray records the meeting app and the microphone, a bar at the top of the screen shows the consent line, a timer and Stop, and the meeting lands in History and in the Meetings list, where opening it shows its notes, transcript and questions."
tags: [area/ai, area/audio, area/capture, surface/macos, stack/react]
relations:
  specifies:
    - speakease:src/meeting/MeetingBar.tsx
    - speakease:src/components/settings/meetings/MeetingsPage.tsx
    - speakease:src/components/settings/meetings/MeetingAsk.tsx
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
- Audience: the owner first, then anyone on macOS 14.2+ (beta; open to everyone since 2026-11-11, no Experimental switch).
- Success signal: one shortcut at the start of a call, one at the end, and the notes are in History minutes later, with
  nothing invented for a call that had nothing in it.

## Scope

- Included (phase 2): the shortcut on Recording, the tray item, the meeting bar, the History entry with its notes.
- Also included (phase 3): the Meetings page (list, notes, transcript, template menu, copy, save .md / .txt); since
  12/11 a list (summary, search, app filter, delete) and a detail per meeting (SE-MEET-024).
- Also included (phase 4a): questions about a meeting on the Meetings page.
- Also included (phase 5): asking whether to take notes when a call app (or Google Meet in a browser) takes the
  microphone.
- Also included (phase 4b): live help in a panel under the bar, at five levels.
- Also included: a recording brought in from Files or a link can become a meeting, with notes in the template AI
  guesses.
- Not yet: saving as .docx. Dictation itself is `ux/dictation.md`.

## Current truth

- **Where it lives**: on macOS 14.2+, with no Experimental switch needed (SE-MEET-022; live subtitles keep it), the
  side column has **Meetings**, Files & links has **Meeting notes**, Recording lists a **Meeting notes** shortcut
  (⌃⌥⌘M by default) and the tray gains a **Meeting notes** item with a tick while a meeting records.
- **Starting**: the shortcut or tray item records the call app that is running (Zoom, Teams, Zalo, Messenger,
  FaceTime, Slack, Discord), playing sound first, else the app used last time, else a browser playing sound; and the
  microphone picked for dictation, as its own stream. With none of these running it records the microphone only
  (SE-MEET-020) instead of failing. No dictation starts. The backend can also start with a source chosen by the user
  (Automatic, Microphone only, or a named app); the Meetings page's record bar picks it (below).
- **Record bar** (SE-MEET-024; fixed at the bottom of the Meetings list, a floating pill like the Speak and Live
  subtitles pages' bars; hidden while a meeting's detail is open, where the meeting bar, the shortcut and the tray
  still stop a recording): a dot, the line "Sẽ ghi: <app> và micro" / "Will record: <app> and the microphone" (or "Sẽ
  ghi: chỉ micro" / "Will record: the microphone only") with a small chevron, and **Bắt đầu ghi** (EN **Start
  recording**). The line is a button (named "Chọn nguồn âm thanh: …" / "Choose the sound source: …") that opens a
  menu above the bar, asked afresh each time it opens: **Tự chọn** (Automatic, hint "Bây giờ: <app> và micro" or
  "Bây giờ: chỉ micro"), **Chỉ micro** (Microphone only), then each running call app or browser by name. Picking one
  ticks it and changes the line; it does not start. The choice lasts while the page is open (also across a visit to
  a meeting's detail) and is not stored; Automatic is the default. Both buttons take Tab; the menu takes arrows,
  Enter and Escape. While a meeting records, however it was started, the dot pulses, the button reads **Dừng**
  (Stop), the line reads "Đang ghi: <app> và micro" (or the microphone-only form) and opens no menu; while it is
  transcribed or its notes written the button is greyed out (no darker hover) and the line shows the bar's phase
  text. When the meeting is saved the list refreshes and the bar is idle again. While the bar asks about a call,
  Start answers it: the question closes and the recording starts (never refused as already recording because of the
  question), on the app asked about for Automatic (the line and the Automatic row name it as the question does, so
  a browser call reads "Google Meet") or on the source picked. A second Start pressed while the first is still on
  its way is refused ("Đang có một cuộc họp được ghi âm."); the first shows its own outcome. Start errors show above
  the bar with the meeting bar's texts; if a named app has gone, the choice goes back to Automatic after the error.
  While a start or a stop has not answered, and while a meeting is finished, the greyed-out Start/Stop keeps
  keyboard focus. If the list of meetings cannot be read, the page says so above the bar ("Không tải được danh sách
  cuộc họp. Hãy mở lại trang này để thử lại."); the bar still shows.
- **Asked when a call starts**: when Zoom, Teams, Zalo, Messenger, FaceTime, Slack or Discord starts using the
  microphone, or a browser does while its front tab is Google Meet, the bar asks on two lines "Microsoft Teams đang
  dùng micro." / "Ghi chú cuộc gọi này?" (EN "Microsoft Teams is using the mic." / "Take notes of this call?")
  with **Lúc khác** (Not now), **Ghi chú** (Take notes) and ×. Only **Ghi chú**, the shortcut, the tray item or the Meetings page's Start records;
  **Lúc khác** or × closes it, and that call is not asked about again (a call ends after a minute with no call app on
  the microphone; leaving a Meet tab for over a minute counts as an end too). Sound alone (a video) never asks, nor
  does a browser on another site. No question while a meeting
  records or is being finished, while a start is on its way, or over an error not yet closed. Since SE-MEET-022 it reaches every user on macOS 14.2+.
  The question can be turned off on Recording, beside the live-help setting: **Hỏi khi có cuộc gọi** (EN "Ask when a
  call starts"), on by default (SE-MEET-023). Off, no call asks and a question already on the bar closes within a few
  seconds; the shortcut, the tray item and the Meetings page's Start still record. Turning it back on during a call
  does not ask about that call; the next call is asked about.
- **Meeting bar**: a pill at the top centre of the screen that never takes focus from the call: a pulsing red dot,
  "Đang ghi âm. Nhớ báo cho mọi người biết nhé." (EN "Recording. Remember to tell everyone."), a timer and **Stop**.
  It asks macOS to keep it out of screen sharing (untested).
- **Live help** (panel under the bar): **Trợ giúp** (Help) on the pill opens a panel below it, **Ẩn** (Hide) closes
  it. Its top row picks the level for this meeting: Chỉ ghi âm (recording only), Lời nói (live transcript, "Tôi" / "Người
  khác", newest line in view; no labels for a microphone-only meeting), Bỏ lỡ gì ("Tôi vừa bỏ lỡ gì?" answers from the last 5 minutes), Tóm tắt (a summary after
  the first lines, updated every 2 minutes), Gợi ý (cards: a question to ask, an action item, still open, a term or
  name, said earlier, a possible answer; a new card shows alone at the top for 4 s, then in the list). Cards are only
  shown, never copied or sent. With no AI, levels 3-5 say why from the start, "Tôi vừa bỏ lỡ gì?" is greyed out, no
  summary is promised, and the transcript still runs. A long summary scrolls inside its own card. The level a meeting starts at is set
  on Recording ("Trợ giúp trực tiếp khi bắt đầu", Chỉ ghi âm by default). The consent line may take two lines so it is
  never cut. After Stop the panel closes and the saved transcript is recognised again from the whole recording.
- **During the meeting**: dictation works as usual; what is dictated stays in the meeting's transcript, marked.
- **Ending**: the shortcut, the tray item or **Stop**. The bar then says "Đang chép lời cuộc họp…", then "Đang viết
  ghi chú…", and hides when the meeting is saved.
- **Result**: one History entry titled "<app> · dd/mm HH:MM" with the transcript (Tôi / Người khác, in time order)
  and the mixed audio; its notes are stored beside it. A microphone-only meeting is titled "Micro · dd/mm HH:MM" (EN
  "Microphone · dd/mm HH:MM"), its transcript has no speaker labels (a dictation is still marked "[đọc chính tả]"),
  its audio is the microphone as recorded, and its notes' kind is guessed from the transcript alone.
- **Meetings page** (SE-MEET-018, SE-MEET-024; owner 12/11: a list first, a meeting's tools only once it is opened):
  the side column has **Meetings** under Live subtitles (macOS 14.2+). The page opens on the **list**, newest first,
  with the record bar at the bottom. Each row: its app (a microphone-only meeting shows "Micro" / "Microphone"; a
  meeting made from Files shows the file's title), "dd/mm HH:MM" and length on the right, and one muted summary line:
  the first line of the notes (headings and Markdown marks dropped), else the first line of the transcript without
  its speaker label, or "Writing the notes…" while first notes are written. Above the list, **Tìm trong cuộc họp**
  (Search meetings) finds every word, ignoring case and accents, in the title, app, notes and transcript; beside it,
  when meetings come from more than one place, an app filter: **Tất cả ứng dụng** (All apps), each app A-Z, "Micro",
  "Tệp" (Files). No match: "Không có cuộc họp nào khớp." Each row has a bin (on hover or keyboard focus, named "Xóa
  <title>") that asks "Xóa cuộc họp này?" - "<title>: ghi chú, bản ghi lời và âm thanh sẽ bị xóa khỏi Cuộc họp và Lịch
  sử. Không thể hoàn tác." with **Hủy** and **Xóa**; Xóa removes the History entry, its audio and its notes, and a
  failure says "Không xóa được cuộc họp."
  Clicking a row opens its **detail**: a back arrow (**Quay lại**, which takes the focus) beside the meeting's title,
  a three-dot menu (**Thêm thao tác**) at the end of the title row with **Copy**, **Save .md** and **Save .txt**,
  then three tabs, **Notes** / **Transcript** / **Ask**, and, on Notes only, the template menu (Meeting, Call,
  Lecture, Interview) - choosing another writes the notes again in the background ("Writing the notes…" above the
  old ones, which stay if it fails). Back returns to the list as it was left (search and filter kept, focus on the
  row just read). Notes open with "AI wrote these notes. Check names and numbers against the transcript." and a link
  to the transcript. With no AI the page says why (AI off, or nothing on this Mac) and shows the transcript; the
  template menu stays open, so once AI is there the notes can be written, and a pick that still finds none updates
  the reason (no message on top); while those first notes are written the transcript stays under "Writing the
  notes…"; an empty recording shows its one line; failed notes show the transcript. A saved file holds the notes,
  then the transcript; Copy takes the transcript on the Transcript tab and the notes on the other two.
- **Ask about this meeting** (the Ask tab of a meeting's detail): "Answers come from this meeting only, with the lines
  they used. Read those lines." The user types a question and presses **Ask**; "Looking through the meeting…" shows
  while it runs, and the newest answer scrolls into view. Each answer quotes the lines it used ("Line 3 [Others] …");
  clicking one opens the Transcript tab with those lines marked. "The meeting doesn't say." when it does not; "The AI
  named no lines. Check the transcript." when an answer cites none; with no AI the reason shows in place of the
  question box, before anything is typed. Questions stay while the app runs, per meeting; deleting a meeting drops
  them.
- **From Files**: with meeting notes on, the result card on Files & links gains **Ghi chú cuộc họp** (Meeting notes).
  Pressing it lists the file on the Meetings page under its title (no app, no Tôi / Người khác labels, the text as
  Files wrote it) and writes its notes in the background in the template AI guesses from the transcript (a lecture
  gets the lecture outline); the card then says "Đã thêm vào Cuộc họp, ghi chú đang được viết." with **Mở Cuộc họp**.
  Nothing runs unless pressed. The template menu can change it, as for a call.
- **Errors** (on the bar, with ×): macOS too old; the app chosen as the source is not running ("Ứng dụng đã chọn không
  còn chạy. Hãy mở lại ứng dụng đó, hoặc chỉ ghi micro."); already recording; the microphone could not
  open; no speech model; the speech detector did not start.

## Screens and states

| Screen         | States                                                                                                                    | Entry                                      | Exit / next                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| Meeting bar    | asking · recording (panel closed / open at levels 1-5) · transcribing · notes · error                                     | call app on the microphone, shortcut, tray | Take notes / Not now / ×; Stop / shortcut / tray; × on error |
| Tray item      | hidden · off · on (ticked)                                                                                                | tray menu (macOS 14.2+)                    | starts or stops                                              |
| Meetings list  | loading · none yet · list · no match · load failed · delete asked                                                         | side column (macOS 14.2+), Back            | a meeting's detail, search, filter, delete                   |
| Meeting detail | notes · writing · empty · no AI · failed; Notes / Transcript / Ask tab; three-dot menu open                               | a row of the list                          | Back, template menu, copy, save, ask                         |
| Record bar     | idle (Automatic / Microphone only / app) · asked (Start answers the question) · menu open · recording · finishing · error | bottom of the Meetings list                | Start, Stop, pick a source                                   |

## Flow

1. The user joins a call and presses ⌃⌥⌘M, ticks the tray item or presses Start recording in the Meetings page's bar.
2. The bar appears with the consent line; the user tells the others they are recording.
3. At the end the user presses Stop; the bar shows the background work, then hides.
4. The meeting is in History and on the Meetings page; with no AI available the page says why and the transcript is
   the record.
5. The user finds the meeting in the list (or searches it), opens it, reads the notes, checks a name against the
   transcript, and saves them as .md from the three-dot menu.
