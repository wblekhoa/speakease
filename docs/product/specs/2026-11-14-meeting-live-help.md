---
id: speakease-spec-2026-11-14-meeting-live-help
type: spec
product: speakease
title: "SpeakEase — Live help in a meeting: speakers, transcript, panel, features (spec)"
status: draft
updated: 2026-11-14
summary: "From the owner's form of 14/11: tell Me from Others by sound, a transcript in paragraphs and sentences, a tabbed live panel that resizes, collapses and moves, eight help features that each do one job, and work orders small models can build from."
tags:
  [area/ai, area/audio, area/capture, surface/macos, stack/rust, stack/react]
relations:
  derivedFrom:
    [speakease-decisions, speakease-ux-meetings, speakease-logic-meetings]
  changes: [speakease-ux-meetings, speakease-logic-meetings]
---

# SpeakEase — Live help in a meeting (spec)

## Why

The owner used the installed build in a first meeting (Chrome's sound through the speakers) and found four faults:
the transcript is not cut by sentence in context; lines are labelled "Me" when the meeting app said them; the live
panel cannot be resized or collapsed and its items are hard to use; the help features do not differ enough to be
worth having. The owner also asked for documents detailed enough for smaller models to build from.

## How to read this spec

Every item carries a status:

- **DECIDED**: the owner chose it (`decisions.md` 2026-11-14). Build to it.
- **PROPOSED**: the AI's proposal, not confirmed. Do not build until the owner answers round 2.
- **OPEN**: a fork with no proposal strong enough to build on. Asked in round 2.

Only stream 1 has work orders (`ai-memory/plans/meeting-live-help.md`). A builder never builds a PROPOSED or OPEN
item.

## What the code does today (read at `b5594fc`)

| Area               | Fact                                                                                                                                                                 | Where                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Two tracks         | "Me" is the microphone stream, "Others" is the meeting app's tap. They reach the live panel as `(me, samples)` chunks and the saved transcript as two whole tracks.  | `meeting.rs` `open_microphone`, `record`, `transcribe_tracks`       |
| Echo, saved        | A "Me" turn of 3+ words is dropped when 60 % of its words are in "Others" turns within 2 s. Words only, after recognition.                                           | `meeting.rs` `drop_echo`                                            |
| Echo, live         | No filter.                                                                                                                                                           | `meeting_live.rs`                                                   |
| Cuts, saved        | A pause of 0.7 s, a breath after 12 s, never over 25 s. Each span is recognised alone and is one line.                                                               | `meeting.rs` `CUTS`, `speech_spans`                                 |
| Cuts, live         | A pause of 0.4 s, a phrase pause after 2.5 s, never over 6 s (the subtitle segmenter).                                                                               | `live_subtitles.rs` `Segmenter`                                     |
| Context            | `TranscriptionManager::transcribe(audio)` takes no earlier text. Whisper-family models take an initial prompt, used today for custom words; other engines take none. | `managers/transcription.rs`                                         |
| Panel              | One window, 540 wide, 64 high as a bar and 64 + 440 with the panel, top centre, never key, never focusable, kept out of screen sharing.                              | `meeting_window.rs`                                                 |
| Panel layout       | Five cumulative levels, one column: summary card, catch-up button, fresh suggestions, then lines and cards by time.                                                  | `src/meeting/MeetingPanel.tsx`                                      |
| Suggestions        | One prompt every 2 minutes returns up to 4 lines of six kinds; nothing is remembered between runs.                                                                   | `meeting_live.rs` `suggestion_instructions`, `parse_suggestions`    |
| A panel that moves | The live-subtitles panel is dragged, its width changed by its edges, and its position and look remembered.                                                           | `src/subtitles/LiveSubtitles.tsx`, `subtitle_window.rs` `fit_frame` |

## Stream 1 — Me and Others (first, owner's order)

| #   | Item                                                                                                                                                                                                                                                                                                                         | Status                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Before recognition, the microphone's sound is compared with the app's sound. Stretches of the microphone that are the app's sound heard through the speakers are not recognised as "Me".                                                                                                                                     | DECIDED                                                                                                                                                                                                                                             |
| 1.2 | The same rule runs for the saved transcript and for the live panel, from one module.                                                                                                                                                                                                                                         | DECIDED (the owner's complaint covers both)                                                                                                                                                                                                         |
| 1.3 | When the user speaks while the app plays sound, the user's words are kept as long as the user is at least as loud at the microphone as the app's echo; the app's words in that same second may stay under "Me". When the echo is about twice as loud as the user, the user's words in that second can be lost (trial: 84 %). | PROPOSED (AI default; a louder echo is the case for echo cancellation, item 1.7)                                                                                                                                                                    |
| 1.4 | The saved audio is not changed; the filter only decides what is recognised.                                                                                                                                                                                                                                                  | PROPOSED (AI default)                                                                                                                                                                                                                               |
| 1.5 | The word filter (`drop_echo`) stays as a second layer on the saved transcript.                                                                                                                                                                                                                                               | PROPOSED (AI default)                                                                                                                                                                                                                               |
| 1.6 | A microphone-only meeting has no app track and no filter.                                                                                                                                                                                                                                                                    | DECIDED (follows SE-MEET-020)                                                                                                                                                                                                                       |
| 1.7 | Echo cancellation with a new library.                                                                                                                                                                                                                                                                                        | Not now. Only if the owner's next meeting on speakers still mixes the speakers; needs the owner's yes for the dependency.                                                                                                                           |
| 1.8 | Which app was recorded in the owner's test.                                                                                                                                                                                                                                                                                  | OPEN. The app logs "Meeting: recording <bundle id> and the microphone" at each start, but the installed app's log file holds no such line. At the next test the coordinator reads that line; the Meetings page's record line already names the app. |

New rule for `logic/meetings.md`, added by the builder in the commit that makes it true:

- **SE-MEET-025**: for a meeting with an app track, a stretch of the microphone that is a late or early copy of
  the app's sound (within half a second) is treated as silence for recognition, in the saved transcript and in the
  live panel; a stretch in which the user is at least as loud as that copy is kept whole. The saved audio keeps
  everything. Known limits: in a second where the user and the app sound together, the app's words can still appear
  under "Me"; where the app's echo is about twice as loud as the user, the user's words in that second can be lost.

## Stream 2 — Transcript quality

| #   | Item                                                                                               | Status                                                                                                                                                                                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | Consecutive pieces by the same speaker show as one paragraph, cut into sentences.                  | DECIDED                                                                                                                                                                                                                                                                                                                                                             |
| 2.2 | Each paragraph has a time mark.                                                                    | DECIDED; format `mm:ss` from the meeting's start is PROPOSED                                                                                                                                                                                                                                                                                                        |
| 2.3 | The model gets the previous sentence as context.                                                   | DECIDED as a direction. Possible only for models with `supports_initial_prompt`; for the others it cannot be built. Needs a measurement first: does a prompt of earlier words make Whisper repeat or invent? PROPOSED: the last 30 words of the same track after the custom words; dropped if the measurement shows repeats.                                        |
| 2.4 | After the meeting, AI fixes punctuation and capitals.                                              | DECIDED. PROPOSED guard: the AI's text is used only when its words, ignoring case and punctuation, equal the recognised words; otherwise the recognised text stays. Engine order and no-AI states as SE-MEET-012.                                                                                                                                                   |
| 2.5 | AI fixes each live line lightly.                                                                   | DECIDED as a direction; which engines may do it is OPEN (a request per line: free with Apple Intelligence, paid with a saved key, heat with the on-device model).                                                                                                                                                                                                   |
| 2.6 | The saved transcript is recognised again with the accurate Vietnamese model, not the selected one. | OPEN (SE-MEET-006 has waited for this answer since phase 4b)                                                                                                                                                                                                                                                                                                        |
| 2.7 | How the stored transcript changes.                                                                 | PROPOSED: the stored text stays one line per recognised turn, so line citations (`meeting_ask.rs`), the 700-word split at speaker turns (`meeting_notes.rs`), `summaryLine` and export keep working; paragraphs, sentences and time marks are derived where the transcript is read. Lesson: `ai-memory/lessons/reflowing-stored-text-is-rewriting-the-original.md`. |

## Stream 3 — The live panel

| #    | Item                                                                    | Status                                                               |
| ---- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 3.1  | The panel sits under the recording bar and has tabs.                    | DECIDED                                                              |
| 3.2  | Its size changes by dragging.                                           | DECIDED                                                              |
| 3.3  | It collapses back to the bar.                                           | DECIDED                                                              |
| 3.4  | Position and size are remembered.                                       | DECIDED; PROPOSED: on this Mac, as the subtitle panel does           |
| 3.5  | The bar and panel can be dragged elsewhere.                             | DECIDED                                                              |
| 3.6  | "thanh có thêm trạng theo thu nhỏ" (owner's words).                     | OPEN: what the smaller bar shows                                     |
| 3.7  | Changing the panel's direction (side, free window).                     | OPEN: asked for in the owner's first message, not picked in the form |
| 3.8  | Which tabs exist and what each holds.                                   | OPEN (proposal in stream 4)                                          |
| 3.9  | What replaces the five levels and the "Live help at the start" setting. | OPEN                                                                 |
| 3.10 | Font size, two tabs side by side.                                       | Not chosen                                                           |

## Stream 4 — Help features

The owner wants all eight (DECIDED). What each one does is PROPOSED below: one job, one trigger, one place. Round 2
confirms the table and the tab each lives on.

| Feature              | Its one job                                                                                              | Trigger                                                                         | Shows                                                             | Remembers                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Trả lời giúp         | When someone asks the user something, offer 1-3 short points to answer with, from what the meeting said. | A question to the user in an Others line (OPEN: automatic, on a press, or both) | One card at the top of the open tab, then in the Suggestions list | Nothing; one card per question                                                              |
| Việc cần làm         | A growing list of who does what by when.                                                                 | Each refresh adds or updates items                                              | A checklist; newest first                                         | Yes, the whole meeting                                                                      |
| Đã chốt / chưa chốt  | Two lists: what was agreed, what is still open. An open point moves when it is settled.                  | Each refresh                                                                    | Two short lists                                                   | Yes, the whole meeting                                                                      |
| Tôi bỏ lỡ gì         | Catch up after looking away.                                                                             | A press only                                                                    | A short answer over the last minutes                              | Nothing                                                                                     |
| Tóm tắt trực tiếp    | The meeting so far in a few lines.                                                                       | Each refresh                                                                    | One block, rewritten                                              | The previous summary is the next one's start                                                |
| Câu hỏi nên hỏi      | Up to 3 questions worth asking now.                                                                      | Each refresh; replaced, not piled up                                            | A short list                                                      | Nothing                                                                                     |
| Thuật ngữ, tên riêng | A glossary of terms and names heard.                                                                     | Each refresh adds new entries                                                   | A list, A-Z                                                       | Yes; OPEN: explained from the meeting only, or from the AI's own knowledge marked unchecked |
| Hỏi AI khi đang họp  | The user asks; the answer comes from this meeting with the lines it used (as SE-MEET-014).               | The user asks                                                                   | Question and answer                                               | The questions of this meeting                                                               |

Open with this stream:

- **Typing in the panel**: the panel's window never becomes key, so a text box cannot take typing today. OPEN: the
  window takes the keyboard only while the box is clicked, the question is spoken with a shortcut, preset question
  buttons only, or the question is asked in the main window.
- **When AI runs**: OPEN - for the whole meeting, only while the panel is open, or only for the open tab. With a
  saved key every run costs the user money.
- **One request or many**: PROPOSED - one refresh request returns the summary, action items, decisions, open points,
  questions and terms together, given the previous lists and the new lines; "Trả lời giúp", "Tôi bỏ lỡ gì" and "Hỏi
  AI" are their own requests.
- **Do the lists reach the saved notes**: OPEN. Today the notes are written from the saved transcript alone.

Proposed tabs (PROPOSED, round 2): **Lời nói** (transcript) · **Tóm tắt** (summary, decided / open, "Tôi bỏ lỡ gì")
· **Việc** (action items) · **Gợi ý** (answer help, questions to ask, terms) · **Hỏi**.

## Stream 5 — Documents for smaller models

DECIDED (the owner asked for it). The system has three layers, each with one job:

1. `docs/product/decisions.md`: what the owner chose, in the owner's words.
2. This spec: what will be true, item by item, with a status.
3. `ai-memory/plans/meeting-live-help.md`: the order of work and one work order per task. A work order names the
   files a builder may touch, the functions to add with their signatures, the tests that must pass, the commands to
   run and what it must not do. A builder needs the work order and the files it names, nothing else.

Roles (HQ model routing): a Sonnet builder per work order; an Opus reviewer per pull request; the coordinator
dispatches, runs the checks that need the installed app, and merges.

## Design contract — Live panel

The user is the owner, then anyone on macOS 14.2+ in a call, lecture or interview (`goal.md`, `ux/meetings.md`
Purpose). During a call their eyes are on the call; they glance at the panel for one thing at a time. Every glance:
"what was just said" or "what should I say now". Rare but high-risk: the panel covers the call, takes the keyboard
from it, or shows in a shared screen. It is a React page in a non-activating panel window; the subtitle panel already
drags, resizes by its edges and remembers its place. `goal.md` has no `## Point of view` card yet (App Studio inbox
item 2026-10-27), so this contract is written without one.

**User + job:** someone in a live call glances over to catch what was said or what to say next, without leaving the
call.
**First-read object:** the newest line of the conversation, with who said it. (assumed: until round 2 fixes the
tabs)
**Primary action:** switch tab to the one help wanted now.
**Density:** compact - it floats over a call and must leave the call visible; one line of chrome (tabs), then
content.
**Hierarchy:** bar (recording, timer, Stop) → tabs → the open tab's content → new-item marks on the other tabs.
**Interaction model:** a tabbed floating panel; lists that grow at the bottom and stay scrolled to the newest unless
the user scrolled back.
**Responsive priority:** at the narrowest width the tabs keep their labels and scroll sideways before they turn into
icons; the bar keeps the dot, the timer and Stop; the consent line is the first thing shortened. (assumed)
**References:** (from training, not fetched) Granola's live notes panel → the transcript is one click away, not the
main view → our transcript is a tab, not a column that pushes help down. Otter's live meeting view → summary,
transcript and chat as tabs of one meeting → our tabs. macOS Live Captions → a small floating window that can be
dragged and resized and never takes focus → our window behaviour. SpeakEase's own subtitle panel → drag anywhere on
the panel, edges change the width, the place is remembered → reuse it.
**Forbidden defaults:** `slop-03` (cards inside cards: a suggestion card inside a tab's card); `slop-04` (one gap
everywhere); `slop-09` (animating the window's height or width with a CSS transition); `slop-01` (a coloured left
border to mark a new suggestion); a tab per kind of suggestion with one item each; a panel that opens over the centre
of the call; a level slider that hides which features are on; a new card that moves the line the user is reading.
**Finish evidence:** see Acceptance, stream 3 (written with its work orders after round 2).

## Acceptance — stream 1

- [ ] Unit tests on made-up tracks: a microphone that holds only the app's echo is silenced for at least 90 % of
      its length; a microphone with only the user's voice loses nothing; a user as loud as the echo loses at most
      10 %; an app track put together from late chunks still matches (at least 80 %).
- [ ] Each meeting with an app track logs one line of figures (likeness, usual lag, seconds silenced), no words.
- [ ] The saved transcript of a made-up meeting whose microphone holds only the app's echo has no "Me" line.
- [ ] The live panel on the same made-up meeting shows no "Me" line.
- [ ] The saved audio is byte-for-byte what it was before this change, for the same input.
- [ ] A microphone-only meeting behaves as before.
- [ ] `cargo test`, `cargo clippy`, `cargo fmt --check`, `bun run gate:fast`.
- [ ] Coordinator: two speech files made with `say` (one voice as the app, one as the user, the app's file mixed
      quietly and late into the user's) through the hidden probe give the user's words under "Me" and none of the
      app's.
- [ ] Owner: one call on speakers and one on headphones in an installed build; "Me" holds only the owner's words.

Acceptance for streams 2-4 is written with their work orders, after round 2.

## Change log

- 2026-11-14: created from the owner's form, round 1.
- 2026-11-14: after a second trial on generated speech - the limit of item 1.3 and SE-MEET-025 is stated (an echo
  about twice as loud as the user can cost the user's words), the acceptance figures follow it, and each meeting
  logs the echo check's figures so the threshold can be set from a real call.
