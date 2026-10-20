---
id: speakease-logic-app-shell
type: logic
product: speakease
title: "SpeakEase — App shell (logic)"
status: active
updated: 2026-10-20
summary: "Rules for the side column's widths and folding, the language menu, tray navigation, the update feed and manual checks, and first-launch permissions (SE-APP)."
tags: [area/layout, area/updater, area/permissions, stack/tauri]
reqPrefix: SE-APP
relations:
  specifiedBy: [speakease-ux-app-shell]
  implements:
    - speakease:src/lib/utils/sidebarWidth.ts
    - speakease:src/components/Sidebar.tsx
    - speakease:src/App.tsx
    - speakease:src/components/settings/app/AppSettings.tsx
    - speakease:src/components/update-checker/UpdateChecker.tsx
    - speakease:src-tauri/src/lib.rs
    - speakease:src-tauri/src/settings.rs
---

# SpeakEase — App shell (logic)

## Purpose

- Keep the window out of the way of dictation: the side column folds and resizes by hand, the app opens where the
  user asked from the tray, first launch asks only for what dictation needs, and updates come from SpeakEase itself.
- Success signal: a drag on the column's edge never leaves it at an unusable width; a new user reaches a working
  shortcut through permissions and one model, without visiting settings.

## Rules

Status column: `live`, `not built`, or `blocked`. A live rule has its REQ-ID as a one-line comment next to the test
or code named in Evidence.

| REQ-ID     | Rule (behaviour-changing)                                                                                                                                                                                                                                                                                 | Status (live / not built / blocked) | Evidence (code path or test)                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SE-APP-001 | The open side column is 208 px by default and the user's to drag between 180 and 320 px; inside that range it follows the cursor exactly.                                                                                                                                                                 | live                                | `src/lib/utils/sidebarWidth.test.ts`                                                                                                                     |
| SE-APP-002 | Dragging the edge past halfway between the folded rail (76 px) and 180 px folds the column; dragging a folded rail's edge out past the same mark opens it - both within one drag, as often as the cursor crosses.                                                                                         | live                                | `src/lib/utils/sidebarWidth.test.ts`                                                                                                                     |
| SE-APP-003 | Between that mark and 180 px, and past 320 px, the edge follows a third of the cursor's travel; letting go settles on 180 or 320.                                                                                                                                                                         | live                                | `src/lib/utils/sidebarWidth.test.ts`                                                                                                                     |
| SE-APP-004 | The width tracks the cursor with no easing while dragged; folding, opening and the settle on release ease (220 ms), and not at all with Reduce Motion.                                                                                                                                                    | live                                | `src/components/Sidebar.tsx` (`snapping`), `src/App.css` (`.side-panel`)                                                                                 |
| SE-APP-005 | Double-clicking the edge puts an open column back to 208 px and opens a folded one.                                                                                                                                                                                                                       | live                                | `src/components/Sidebar.tsx` (`onDoubleClick`)                                                                                                           |
| SE-APP-006 | Folded or open is remembered at once, the width when the hand lets go, on this Mac (browser storage), surviving a relaunch; unreadable storage falls back to open at 208 px.                                                                                                                              | live                                | `src/App.tsx` (`foldSidebar`, `resizeSidebar`)                                                                                                           |
| SE-APP-007 | The tray's "Open SpeakEase" shows the window on Speak; "History" shows it on History.                                                                                                                                                                                                                     | live                                | `src-tauri/src/lib.rs` (`"open_app"`, `"open_history"`)                                                                                                  |
| SE-APP-008 | Update checks are on by default and read only SpeakEase's own GitHub releases, signed with SpeakEase's key; `HANDY_DISABLE_UPDATER` turns them off for the run without changing the stored choice.                                                                                                        | live                                | `src-tauri/src/settings.rs` (`default_update_checks_enabled`, `update_checks_forced_disabled`), `tauri.conf.json`                                        |
| SE-APP-009 | The App switch turns off only the automatic check at launch; a check the user asks for (footer, app menu, tray) always runs and says when it fails, while the launch check stays silent. Only `HANDY_DISABLE_UPDATER` removes manual checks.                                                              | live                                | `src/components/update-checker/UpdateChecker.tsx` (`canUpdate`, `isManualCheckRef`), `src-tauri/src/lib.rs` (`"check_updates"`), `src-tauri/src/tray.rs` |
| SE-APP-010 | First launch asks for Accessibility and Microphone, then for one model; a returning user who lost a permission sees only the permission step, and one with both goes straight to the app.                                                                                                                 | live                                | `src/App.tsx` (`checkOnboardingStatus`, `handleAccessibilityComplete`)                                                                                   |
| SE-APP-011 | The interface language has its own menu at the foot of the side column (a globe and the language's name; a square key when folded), listing each language in its own name with the current one ticked; choosing one switches the window and the tray at once and is the same setting as App › Appearance. | live                                | `src/components/LanguageMenu.tsx`                                                                                                                        |

## States and transitions

| State         | Trigger                                   | Next state      | Edge case                                           |
| ------------- | ----------------------------------------- | --------------- | --------------------------------------------------- |
| column open   | drag edge below the fold mark             | column folded   | crossing back in the same drag opens it again       |
| column open   | drag edge between mark and 180 / past 320 | rubber band     | release settles on 180 / 320                        |
| column folded | drag edge out past the fold mark          | column open     | a short pull that stays under the mark does nothing |
| column folded | switch, or double-click the edge          | column open     |                                                     |
| column open   | switch                                    | column folded   |                                                     |
| launch        | permissions missing                       | permission step | returning users skip the model step afterwards      |
| launch        | update checks on                          | silent check    | an update shows in the footer; a failure is silent  |
| any           | Check for Updates… (menu or tray)         | manual check    | failure shows a toast                               |

## Fixed vs flexible

- Fixed (logic the UI must not change): the 180-320 px range, the fold mark between the rail and 180 px, the
  remembered fold and width, the update feed and signing key, permissions before the model on first launch.
- Flexible (UI may explore): the rail's 76 px width, the easing curve and duration, the rubber-band ratio, the grip's
  look, the order and grouping of rows on the App page.

## Open questions

- None recorded.

## Change log

- 2026-10-20: reviewed after lib.rs gained the live-subtitles tray item, commands and the hidden `--live-subtitle-probe` flag (rules in `logic/live-subtitles.md`); SE-APP rules unchanged.
- 2026-10-15: reviewed after App.tsx took file drops (SE-FILE-006), the dead update command went and SE-APP-008's comment moved to `default_update_checks_enabled`; SE-APP rules unchanged.
- 2026-10-14: SE-APP-011 - the interface language gets its own menu at the foot of the side column.
- 2026-10-14: reviewed after Files joined the side column and lib.rs gained the file commands; SE-APP-001…010 unchanged.
- 2026-10-13: SE-APP-009 changed - manual checks no longer depend on the automatic-check switch (the app menu item used
  to do nothing with it off; the tray item was greyed out).
- 2026-10-13: created; REQ-IDs added as one-line comments next to the evidence in the same commit.
