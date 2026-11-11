---
status: executing
owner: Lê Khoa
started: 2026-11-11
current-phase: lane-2 (PR open)
summary: "Let the user open a meeting by hand anywhere: microphone-only recording when no call app runs, a Start control with a source menu on the Meetings page, and meeting notes out of Experimental, in two sequenced lanes."
tags: [area/audio, area/capture, stack/rust, stack/react]
---

# Meetings the user opens by hand

Source of truth: `docs/product/decisions.md`, entry 2026-11-11. This plan orders the work and names the seams; it
decides nothing that entry has not. Rules live in `docs/product/logic/meetings.md`, behaviour in
`docs/product/ux/meetings.md`; both change in the same commit as the code.

## Decided (owner, 11/11)

1. No call app running → the meeting records the microphone only. No `no-app` error for an empty pick.
2. A Start control on the Meetings page. The shortcut and the tray item stay.
3. The app picks the source; a menu beside the button changes it for that start.
4. A microphone-only recording has no speaker labels (as a recording from Files).
5. It starts at once; AI guesses the kind.
6. Meeting notes are no longer behind Experimental. Live subtitles stay behind it.
7. The coordinator merges a lane's PR when CI is green and the Opus reviewer passes it.

AI defaults (not owner-confirmed): title "Micro · dd/mm HH:MM" / "Microphone · …"; same consent line; "microphone
only" from the menu is not remembered; macOS below 14.2 unchanged.

## New rules

| REQ-ID      | Rule                                                                                                                                                                                                                                                                                      | Lane |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SE-MEET-020 | A meeting's source is automatic, the microphone only, or a named app. Automatic picks as before and falls back to the microphone only when no app qualifies. A microphone-only meeting has one track, no speaker labels, no app in its row or its kind guess, and no silent-track notice. | 1    |
| SE-MEET-021 | The Meetings page starts and stops a meeting; a menu beside Start lists Automatic (naming what it would record now), Microphone only, and each running call app or browser.                                                                                                               | 2    |
| SE-MEET-022 | Meeting notes (shortcut, tray item, the question when a call starts, Meetings page, Files button, live-help setting) show without Experimental on macOS 14.2+; live subtitles still need Experimental.                                                                                    | 2    |

## Lanes (sequenced: both touch `meeting.rs`, `bindings.ts`, both `translation.json`, both meetings docs)

### Lane 1 — capture (Opus, R3)

- `src-tauri/src/meeting.rs`, `commands/meetings.rs`, `meeting_live.rs`, `meeting_notes.rs`, `managers/history.rs`
  only where the one-track case needs it; `src/bindings.ts`; `src/dev/mockTauri.ts`; the strings a microphone-only
  meeting shows (title, bar); `logic/meetings.md`, `ux/meetings.md`.
- Before coding, list every place that assumes two tracks (start, tap rebuild, silent-track notice, the echo drop
  in `the_others_heard_through_the_microphone_are_dropped`, labels, title, `meetings` row, kind guess, live panel,
  re-recognition after Stop) and say for each what the one-track case does.
- Freeze the interface lane 2 builds on and write it under "Interface for lane 2" below: the command that starts
  with a source, the command that lists the sources (with what Automatic would pick now), their generated types,
  and the i18n keys already added.
- Verify: `bun run lint`; `bunx tsc --noEmit`; `bun run check:translations`; `cargo fmt --check`; `cargo clippy`
  (no new finding in touched files); `cargo test --lib` with new tests for: the empty pick gives the microphone
  only, a named source wins, a one-track transcript has no labels and keeps dictation marks, the title, the row and
  the kind guess carry no app; `node ~/JAK/companies/docs-house/doc-engine/bin/doc-index.mjs --check --product
speakease` 0 errors.

### Lane 2 — Start control and gate (Sonnet, R2; starts after lane 1 is on `main`)

- `src/components/settings/meetings/MeetingsPage.tsx` (Start / Stop and the source menu, from WAVE tokens and the
  app's existing menu and button components); `settings.rs` `app_audio_features_on` split so meetings need only the
  tap while live subtitles keep Experimental; every caller of that function; both locales; both meetings docs;
  `ux/app-shell.md` if the side column or Experimental text changes.
- Verify: the lane-1 commands; `bun run test:unit`; the page driven in the browser preview in light and dark
  (idle, recording, finishing, error, menu open with no app / one app / several); `jak-hq:design-edit`.

### After each lane

Opus review through `jak-hq:reviewer` (Standards and Spec), fixes, PR, CI, merge by the coordinator.

## Interface for lane 2

Frozen by lane 1 (SE-MEET-020). Rust in `src-tauri/src/meeting.rs` and `commands/meetings.rs`; TS in `src/bindings.ts`.

- **Start**: `commands.startMeeting(source: MeetingSource): Promise<Result<null, string>>` (Tauri `start_meeting`,
  argument `source`). It replaced the old `startMeeting(bundleId)`; nothing in the UI called that one. Errors use the
  existing codes in `src/lib/meeting.ts`: `unsupported`, `no-app` (only when a named app is not running; the text in
  `meeting.error.no-app` was reworded for that), `running`, `microphone`, `no-model`, `vad`. On success the state
  arrives on the `meeting-state` event as before.
- **Sources**: `commands.meetingSources(): Promise<MeetingSources>` (Tauri `meeting_sources`, no argument, never fails).
  Call it when the menu opens; the list is a snapshot.
- **Types** (as specta writes them):
  - `MeetingSource = { kind: "automatic" } | { kind: "microphone" } | { kind: "app"; value: string }` (`value` is a
    bundle id from `RunningApp.bundle_id`).
  - `MeetingSources = { automatic: RunningApp | null; apps: RunningApp[] }`. `automatic` is what Automatic would record
    now, resolved by the same `resolve_source` a start uses; `null` means the microphone only. `apps` is every running
    call app or browser, call apps first, in `MEETING_APPS` order. "Microphone only" is always available and is not
    listed: the menu adds it itself. `automatic` can be an app missing from `apps` (an app the user recorded last time
    that is not a call app or browser).
  - `RunningApp = { bundle_id: string; name: string; playing: boolean }` (unchanged, also used by live subtitles).
  - `LiveView.microphone_only: boolean` (new): the live panel hides the Me / Others label when true.
  - `Meeting.app_name` is `""` for a microphone-only meeting. Only the Meetings list reads it; it shows the entry's
    `title` instead (`MeetingsPage.tsx`, `m.meeting.app_name || m.title`). `MeetingState.app_name` is `null` while a
    microphone-only meeting records.
- **Shortcut, tray, call question**: unchanged entry points; they start on Automatic (or the asked app).
- **i18n keys added**: none. Changed: `meeting.error.no-app` (vi, en). The menu labels (Automatic, Microphone only,
  the Start button) are lane 2's to add.
- **Mock** (`src/dev/mockTauri.ts`): `meeting_sources` follows `?sources=none|one|several` (several by default);
  `start_meeting` emits `meeting-state` "recording" (app name `null` for the microphone only) and rejects a named app
  not in the list with `no-app`; `?meeting=recording&mic` and `?mic` on the live panel preview a microphone-only
  meeting; the Meetings list has a microphone-only entry "Micro · 11/11 08:45".
- **Known behaviour lane 2 should show, not change**: Automatic prefers the app recorded last time whenever it is
  running, even a silent browser, so with Chrome open after a Chrome meeting Automatic is not the microphone only;
  a call that starts during a microphone-only meeting is not asked about.

## Open risks

- Nothing in meeting notes has run in the installed app. Lanes prove unit tests and the browser preview only; the
  first real run is the owner's two-minute microphone-only meeting.
- With the gate gone the "Take notes of this call?" question reaches every user and has no off switch (owner to
  decide before lane 2 ends).
- The meeting shortcut (⌃⌥⌘M) becomes registered for every user on 14.2+.
