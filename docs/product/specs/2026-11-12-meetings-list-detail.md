---
id: speakease-spec-2026-11-12-meetings-list-detail
type: spec
product: speakease
title: "SpeakEase — Meetings page: list first, detail on click (spec)"
status: draft
updated: 2026-11-12
summary: "Redesign of the Meetings page from the owner's form of 12/11: a searchable list of meetings with a summary line and delete, a detail view with back, three tabs and a three-dot menu, and the Start control in a bar fixed at the bottom."
tags: [area/ai, area/capture, surface/macos, stack/react]
relations:
  derivedFrom: [speakease-decisions, speakease-ux-meetings]
  changes: [speakease-ux-meetings, speakease-logic-meetings]
---

# SpeakEase — Meetings page: list first, detail on click (spec)

## Why

The owner, with a screenshot of the page: make it simpler and split it into separate flows; show the list of meetings
first, and only a meeting's detail brings its many tools. Today the Start control, the list, the notes with their tabs,
the template menu, Copy, Save .md, Save .txt and the question panel all show at once.

## Owner decisions this spec follows

`decisions.md` 2026-11-12 "Meetings page: a list first, a meeting's detail on click (owner form)". The AI defaults
listed there are marked (assumed) below.

## Change

- **List view** (the page as it opens): each meeting as one row - app (or "Micro"), "dd/mm HH:MM", length, and one
  summary line. Above it, a search box and an app filter. Each row has a delete button that asks first. Clicking a row
  opens its detail.
- **Detail view**: a back arrow beside the meeting's title, a three-dot menu (Copy, Save .md, Save .txt) at the end of
  the title row, then three tabs - Notes, Transcript, Ask. The template menu stays on its own, on the Notes tab.
- **Record bar**: the Start control moves into a floating bar fixed at the bottom of the list view, like the Speak and
  Live subtitles pages: the status dot and what will be recorded, the source menu (opening upward), and Start / Stop.

## Design contract — Meetings list

The user is the owner, then anyone on macOS 14.2+ who records calls, lectures or interviews (`goal.md`, `ux/meetings.md`
Purpose). They come back to find one meeting and read what it decided, or to start recording. Every day: scanning the
list for the meeting just held, and pressing Start. Rare but high-risk: deleting a meeting (audio, entry and notes go
for good). Built with React + Tailwind in the existing settings window (780 px wide at open, side column may fold);
`Dialog`, `Dropdown`, `Button`, the History search box and the Live subtitles bottom bar already exist. `goal.md` has no
`## Point of view` card yet (App Studio inbox item 2026-10-27), so this contract is written without one.

**User + job:** a SpeakEase user finds one past meeting by its app, day or words, or starts a new recording.
**First-read object:** the newest meeting's row: its app and time, then what it was about (summary line).
**Primary action:** open a meeting (click its row).
**Density:** balanced - rows are scanned, so two lines per row, but with WAVE's air between rows; no table chrome.
**Hierarchy:** meeting rows (app · time · length, then summary) → search and app filter → record bar → delete per row.
**Interaction model:** a searchable list; a row is a link into the detail; a floating bar for the one recording action.
**Responsive priority:** at 780 px and with the side column open the summary truncates to one line; search and filter
share one row and the filter keeps its width; the record bar keeps the Start button and truncates the source text.
**References:** (from training, not fetched) Otter.ai conversation list → a summary snippet under each title lets the
user pick a meeting without opening it → our summary line. Apple Voice Memos → a plain list, tap for the recording,
record at the bottom → our bottom bar and list-first page. Granola meeting list → day and time lead each row → our
"dd/mm HH:MM" stays on the first line.
**Forbidden defaults:** `slop-01` (a coloured left border marking the chosen or new row); `slop-03` (each row a card
inside a card); `slop-04` (one gap value for the whole page); a trash icon that deletes without asking; a row title
that repeats the date already in the time column; an empty state that only says "No meetings" without pointing to
Start.
**Finish evidence:** see Acceptance.

## Design contract — Meeting detail

**User + job:** the user reads what one meeting decided and checks it, or asks a question about it.
**First-read object:** the meeting's notes (the Notes tab), under its title.
**Primary action:** read the notes; switching tab is the next step, never a peer button row.
**Density:** spacious - reading view, one column, the full width of the page.
**Hierarchy:** back + title → tabs (Notes · Transcript · Ask) with the template menu on Notes → the tab's content →
the three-dot menu for copy and save.
**Interaction model:** a reading view with tabs; copy and save live in a menu.
**Responsive priority:** at 780 px the title truncates before the back arrow or menu move; the tabs and the template
menu wrap to two lines rather than shrinking the tabs.
**References:** Otter.ai conversation page → Summary / Transcript / chat as tabs of one meeting → our three tabs.
**Forbidden defaults:** a row of equal secondary buttons for Copy / Save .md / Save .txt (the old page); the question
panel squeezed beside the notes; a back control far from the title (top-left of the window).
**Finish evidence:** see Acceptance.

## Acceptance

- [ ] The page opens on the list, never on a meeting; Back returns to the list with the search and filter as left.
- [ ] Each row: app or "Micro" (or the file's title for a meeting made from Files), "dd/mm HH:MM", length, one summary
      line. Summary (assumed): the first content line of the notes with Markdown marks removed (headings skipped);
      without notes (no AI, failed), the first transcript line without its speaker label; "Writing the notes…" while
      first notes are written.
- [ ] Search (assumed: on this Mac, case- and accent-tolerant, over title, app, notes and transcript) narrows the list;
      no match shows a one-line "no meetings match" text.
- [ ] App filter (assumed): All, each app with a meeting, "Micro", and "Files" for meetings made from Files.
- [ ] Delete asks in a dialog that names the meeting and says it cannot be undone; on Delete the meeting leaves the
      list, History and its audio; on failure a toast says so and the list stays.
- [ ] Detail: back arrow (aria-label "Quay lại" / "Back") beside the title; three tabs; the template menu on the Notes
      tab; the three-dot menu holds Copy, Save .md, Save .txt and works by keyboard (arrows, Enter, Escape).
- [ ] An answer's lines still open the Transcript tab with them marked.
- [ ] The record bar is fixed at the bottom of the list, its source menu opens upward, Start / Stop and the status and
      error texts behave as SE-MEET-021 says; the source choice survives opening a meeting and coming back.
- [ ] Captures at 780 px wide (the window's open size) and at the narrowest window: list, empty, no match, load
      failed, delete dialog, detail on each tab, three-dot menu open, source menu open, recording.
- [ ] `bun run lint`, `bun run build`, `bun run test:unit` (new helpers tested), `bun run check:translations`, WAVE
      `wave:review` on the changed files.
- [ ] First-viewport check: a new user can name the newest meeting and the Start button.

## Change log

- 2026-11-12: created from the owner's form.
- 2026-11-12: built. The summary for a meeting without notes is the transcript's first line, not the reason (the
  reason already shows in the detail; a transcript line says what the meeting was about). Copy on the Ask tab takes
  the notes. The back arrow and three dots use lucide like the rest of the app; WAVE's reviewer flags it.
