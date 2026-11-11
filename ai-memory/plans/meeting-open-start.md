---
status: executing
owner: Lê Khoa
started: 2026-11-11
current-phase: lane-1
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

_Lane 1 writes this section before its PR._

## Open risks

- Nothing in meeting notes has run in the installed app. Lanes prove unit tests and the browser preview only; the
  first real run is the owner's two-minute microphone-only meeting.
- With the gate gone the "Take notes of this call?" question reaches every user and has no off switch (owner to
  decide before lane 2 ends).
- The meeting shortcut (⌃⌥⌘M) becomes registered for every user on 14.2+.
