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

- **DECIDED**: the owner chose it (`decisions.md` 2026-11-14, rounds 1 and 2). Build to it.
- **AI READING**: the AI's reading of an owner answer that could mean more than one thing, listed in
  `decisions.md` round 2 as not confirmed. Build to it; it is the first thing to check with the owner.
- **AI DEFAULT**: a detail the owner was not asked. Build to it; cheap to change.
- **KEPT**: what the app already does and this work leaves alone; listed so a builder does not change it.
- **WAITS**: not built now; the reason is given.

Work orders for every stream are in `ai-memory/plans/meeting-live-help.md`. A builder never builds a WAITS item.

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
| 1.3 | When the user speaks while the app plays sound, the user's words are kept as long as the user is at least as loud at the microphone as the app's echo; the app's words in that same second may stay under "Me". When the echo is about twice as loud as the user, the user's words in that second can be lost (trial: 84 %). | DECIDED (round 2: filter first, measure in a real call, then decide on echo cancellation)                                                                                                                                                           |
| 1.4 | The saved audio is not changed; the filter only decides what is recognised.                                                                                                                                                                                                                                                  | KEPT: today's behaviour (the saved audio is the two tracks mixed), no change to approve                                                                                                                                                             |
| 1.5 | The word filter (`drop_echo`) stays as a second layer on the saved transcript.                                                                                                                                                                                                                                               | KEPT: today's behaviour (SE-MEET-008), no change to approve                                                                                                                                                                                         |
| 1.6 | A microphone-only meeting has no app track and no filter.                                                                                                                                                                                                                                                                    | DECIDED (follows SE-MEET-020)                                                                                                                                                                                                                       |
| 1.7 | Echo cancellation with a new library.                                                                                                                                                                                                                                                                                        | WAITS for the figures of the owner's real calls (the log line of work order 1B); needs the owner's yes for the dependency.                                                                                                                          |
| 1.8 | Which app was recorded in the owner's test.                                                                                                                                                                                                                                                                                  | OPEN. The app logs "Meeting: recording <bundle id> and the microphone" at each start, but the installed app's log file holds no such line. At the next test the coordinator reads that line; the Meetings page's record line already names the app. |

New rule for `logic/meetings.md`, added by the builder in the commit that makes it true:

- **SE-MEET-025**: for a meeting with an app track, a stretch of the microphone that is a late or early copy of
  the app's sound (within half a second) is treated as silence for recognition, in the saved transcript and in the
  live panel; a stretch in which the user is at least as loud as that copy is kept whole. The saved audio keeps
  everything. Known limits: in a second where the user and the app sound together, the app's words can still appear
  under "Me"; where the app's echo is about twice as loud as the user, the user's words in that second can be lost.

## Stream 2 — Transcript quality

| #   | Item                                                                              | Status                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | Consecutive pieces by the same speaker show as one paragraph, cut into sentences. | DECIDED                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2.2 | Each paragraph has a time mark.                                                   | DECIDED; format `mm:ss` from the meeting's start is AI DEFAULT                                                                                                                                                                                                                                                                                                                                                                                    |
| 2.3 | The model gets the previous sentence as context.                                  | DECIDED as a direction; WAITS for a measurement (work order 2D): does a prompt of earlier words make a Whisper-family model repeat or invent? Possible only for models with `supports_initial_prompt`. If the measurement is clean: the last 30 words of the same track after the custom words.                                                                                                                                                   |
| 2.4 | After the meeting, AI fixes punctuation and capitals.                             | DECIDED. Guard (AI DEFAULT): the AI's text is used for a line only when its words, ignoring case and punctuation, equal the recognised words; otherwise the recognised line stays. Engine order and no-AI states as SE-MEET-012.                                                                                                                                                                                                                  |
| 2.5 | AI fixes each live line lightly.                                                  | DECIDED: built for every engine the app has. AI READING: behind its own switch, off at first; a cloud service of SpeakEase's own is for a paid app and is not built. Same word guard as 2.4; the raw line shows first and is replaced when the fix arrives.                                                                                                                                                                                       |
| 2.6 | The saved transcript is recognised again with the accurate Vietnamese model.      | DECIDED as a button, pressed when wanted, never automatic. WAITS: the saved audio is the two tracks mixed into one, so a second pass cannot tell Me from Others; the owner chooses between keeping both tracks (more disk) and a second pass without speaker labels (plan, work order 2F).                                                                                                                                                        |
| 2.7 | How the stored transcript changes.                                                | AI DEFAULT: the stored text stays one line per recognised turn, so line citations (`meeting_ask.rs`), the 700-word split at speaker turns (`meeting_notes.rs`), `summaryLine` and export keep working; paragraphs, sentences and time marks are derived where the transcript is read. Time marks need each line's start, stored beside the text, never inside it. Lesson: `ai-memory/lessons/reflowing-stored-text-is-rewriting-the-original.md`. |

## Stream 3 — The live panel

| #    | Item                                                                                                                                                                                          | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1  | The panel sits under the recording bar and has tabs.                                                                                                                                          | DECIDED                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 3.2  | Its size changes by dragging.                                                                                                                                                                 | DECIDED                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 3.3  | It collapses back to the bar.                                                                                                                                                                 | DECIDED                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 3.4  | Position and size are remembered.                                                                                                                                                             | DECIDED; AI DEFAULT: on this Mac, as the subtitle panel does                                                                                                                                                                                                                                                                                                                                                                                            |
| 3.5  | The bar and panel can be dragged elsewhere.                                                                                                                                                   | DECIDED                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 3.6  | The bar has a smaller state: the recording dot, the time and one count that sums the help features' unseen items.                                                                             | DECIDED. AI READING: the count leaves out Lời nói; a press on the small bar brings the full bar back; Stop is on the full bar only.                                                                                                                                                                                                                                                                                                                     |
| 3.7  | Changing the panel's direction (side, free window).                                                                                                                                           | AI DEFAULT: stays under the bar (round 1); not asked again in round 2.                                                                                                                                                                                                                                                                                                                                                                                  |
| 3.8  | Five tabs by job: Lời nói · Tóm tắt · Việc · Gợi ý · Hỏi. Each tab has an on/off button; a feature that is on keeps running while another tab is open; each tab carries a mark of its status. | DECIDED. AI READING: the mark is a count of items added since the tab was last open, a quiet dot while its feature works, a struck-through label when off.                                                                                                                                                                                                                                                                                              |
| 3.9  | A switch per feature in Settings replaces the five levels and the "Live help at the start" setting.                                                                                           | DECIDED. AI READING: the tab's on/off button and the Settings switch are one setting; a tab with several features switches them together. AI DEFAULT for the first run after the update: never more than the level did: 1 → all off; 2 → Lời nói; 3 → + "Tôi bỏ lỡ gì"; 4 → + the summary; 5 → + decisions, Việc, Gợi ý. Hỏi is new and starts off. Lines are recognised when any switch is on; the Lời nói switch only decides whether they are shown. |
| 3.10 | Font size, two tabs side by side.                                                                                                                                                             | Not chosen                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## Stream 4 — Help features

The owner wants all eight (DECIDED, round 1). Round 2 fixed the tabs, the triggers and when AI runs; the "one job"
of each row is the AI's proposal that the tab choice confirmed.

| Feature                           | Its one job                                                                                              | Trigger                                                                           | Shows                                | Remembers                                                                                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trả lời giúp (tab Gợi ý)          | When someone asks the user something, offer 1-3 short points to answer with, from what the meeting said. | DECIDED: appears by itself when a question to the user is heard in an Others line | One card at the top of Gợi ý         | Nothing; one card per question                                                                                                                          |
| Việc cần làm (tab Việc)           | A growing list of who does what by when.                                                                 | Each refresh adds or updates items                                                | A checklist; newest first            | Yes, the whole meeting                                                                                                                                  |
| Đã chốt / chưa chốt (tab Tóm tắt) | Two lists: what was agreed, what is still open. An open point moves when it is settled.                  | Each refresh                                                                      | Two short lists                      | Yes, the whole meeting                                                                                                                                  |
| Tôi bỏ lỡ gì (tab Tóm tắt)        | Catch up after looking away.                                                                             | A press only                                                                      | A short answer over the last minutes | Nothing                                                                                                                                                 |
| Tóm tắt trực tiếp (tab Tóm tắt)   | The meeting so far in a few lines.                                                                       | Each refresh                                                                      | One block, rewritten                 | The previous summary is the next one's start                                                                                                            |
| Câu hỏi nên hỏi (tab Gợi ý)       | Up to 3 questions worth asking now.                                                                      | Each refresh; replaced, not piled up                                              | A short list                         | Nothing                                                                                                                                                 |
| Thuật ngữ, tên riêng (tab Gợi ý)  | A glossary of terms and names heard.                                                                     | Each refresh adds new entries                                                     | A list, A-Z                          | Yes. DECIDED: an explanation may come from the AI's own knowledge and then carries the label "chưa kiểm chứng"; one taken from the meeting carries none |
| Hỏi AI khi đang họp (tab Hỏi)     | The user asks; the answer comes from this meeting with the lines it used (as SE-MEET-014).               | DECIDED: typed in the panel, or said aloud (see below)                            | Question and answer                  | The questions of this meeting                                                                                                                           |

Decided with this stream (round 2):

| #   | Item                                                                                                                                                                                                                                                                                  | Status                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | AI runs for the whole meeting for every feature that is on, whether the panel is open, small or on another tab.                                                                                                                                                                       | DECIDED (the owner accepted the cost with a saved key). The consent line and the engine order stay as SE-MEET-012/013.                       |
| 4.2 | One refresh request returns the summary, action items, decisions, open points, questions to ask and terms together, given the previous lists and the new lines; only the parts whose feature is on are asked for. "Trả lời giúp", "Tôi bỏ lỡ gì" and "Hỏi AI" are their own requests. | AI DEFAULT                                                                                                                                   |
| 4.3 | Typing a question: the panel's window takes the keyboard only while the question box is clicked, and gives it back to the meeting app on Enter, Escape or a click elsewhere.                                                                                                          | DECIDED                                                                                                                                      |
| 4.4 | A question the user says aloud is answered without typing.                                                                                                                                                                                                                            | DECIDED. AI READING: only a "Me" line that begins with the cue "SpeakEase" or "trợ lý" counts, so questions meant for people are left alone. |
| 4.5 | A setting for answering questions, in steps.                                                                                                                                                                                                                                          | DECIDED. AI READING: Off · Questions others ask me (Trả lời giúp) · Also questions I say aloud (4.4).                                        |
| 4.6 | After Stop, the live lists (summary, decided / open, action items, questions, terms, the questions asked) are saved as they are and shown as their own tab of the saved meeting. The written notes are still made from the transcript alone.                                          | DECIDED. AI DEFAULT: the tab is named "Trong cuộc họp" / "During the meeting" and is absent for a meeting that has no lists.                 |

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
**First-read object:** the newest line of the conversation, with who said it (Lời nói is the tab the panel opens
on).
**Primary action:** switch tab to the one help wanted now.
**Density:** compact - it floats over a call and must leave the call visible; one line of chrome (tabs), then
content.
**Hierarchy:** bar (recording, timer, Stop, smaller) → tabs with their marks → the open tab's on/off and content.
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
**Finish evidence:** see Acceptance, streams 3 and 4.

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

## Acceptance — stream 2

- [ ] The saved meeting's Transcript tab shows one paragraph per run of the same speaker, cut into sentences, with
      `mm:ss` at each paragraph; a meeting saved before this change shows paragraphs without time marks.
- [ ] The stored transcript is byte-for-byte what recognition gave, plus only the punctuation fix; citations from
      Ask still open the right line.
- [ ] The punctuation fix never changes a word: unit tests for added, dropped and swapped words keep the recognised
      line.
- [ ] The live-line fix is off at first; on, a line shows raw, then fixed; a fix that changes a word is not shown.
- [ ] `cargo fmt -- --check`, `cargo test --lib`, `bun run gate:fast`, `bun run check:translations`.

## Acceptance — streams 3 and 4

- [ ] The bar has three states - small, bar, bar with panel - and each change resizes the window without a CSS
      transition on its size.
- [ ] The panel is dragged by its bar, resized by its edges within a least and a greatest size, and opens the next
      time where and as large as it was left; a place that is off every screen falls back to top centre.
- [ ] The window stays out of screen sharing and never takes focus from the meeting app, except while the question
      box is clicked; Enter, Escape or a click elsewhere gives the focus back (checked by the frontmost app's name).
- [ ] Five tabs; each on/off button changes the same setting as its switch in Settings, live in both places.
- [ ] A feature that is on gathers items while another tab is open; its tab's count rises and clears when opened.
- [ ] The small bar shows the dot, the time and the sum of the unseen counts.
- [ ] With every feature off no AI request is made in a meeting (unit test on the request builder).
- [ ] Each feature's unit tests on the refresh's merge rules: action items keep their state, an open point moves
      to decided, questions are replaced, terms are added once, an AI-knowledge term carries its label.
- [ ] After Stop the saved meeting has the "During the meeting" tab with the lists as they stood; a meeting with
      no lists has no such tab.
- [ ] Captures at the least and the greatest panel size, light and dark: each tab with content, empty, off,
      working, failed; the small bar; the question box focused.
- [ ] First-viewport check: a new user can name the newest line and the tab to press for help.
- [ ] `bun run lint`, `bun run build`, `bun run test:unit`, `bun run check:translations`, WAVE `wave:review` on the
      changed files; `cargo fmt -- --check`, `cargo test --lib`.
- [ ] Owner: one real meeting with every feature on.

## Change log

- 2026-11-14: created from the owner's form, round 1.
- 2026-11-14: after a second trial on generated speech - the limit of item 1.3 and SE-MEET-025 is stated (an echo
  about twice as loud as the user can cost the user's words), the acceptance figures follow it, and each meeting
  logs the echo check's figures so the threshold can be set from a real call.
- 2026-11-14: review of the pull request - stream 1 is blocked until the owner answers item 1.3; items 1.4 and 1.5
  are today's behaviour and are marked KEPT; the live check places a segment by its last frame.
- 2026-11-14: the owner's round 2 - every open item is DECIDED, an AI READING or an AI DEFAULT; stream 1 is no
  longer blocked; items 4.1-4.6 and the acceptance for streams 2-4 added.
