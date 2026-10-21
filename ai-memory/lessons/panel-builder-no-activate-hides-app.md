---
type: lesson
category: error
scope: speakease
tags: [area/layout, stack/tauri, tauri-nspanel, activation-policy, macos]
summary: "Never build a tauri-nspanel panel with .no_activate(true) while the app is running: it flips the app to the Prohibited policy, which hides every window until the Dock icon is clicked."
status: active
superseded_by:
last_verified: 2026-10-21
---

# panel builder no activate hides app

## Trigger

Owner, 21/10: pressing Start showed no subtitle panel. It appeared only after clicking SpeakEase's Dock icon.
The panel was created on demand while the main window was open, so the app was in the Regular policy.

## Root cause

`PanelBuilder::no_activate(true)` (tauri-nspanel `builder.rs`, `build`) sets `NSApplicationActivationPolicy::Prohibited`
around the window build and then restores the old policy. Leaving Regular hides the app's windows, and restoring
Regular does not unhide them. `order_front_regardless` and the Status level do not show a hidden app's panel.
The recording pill uses the same flag without trouble because it is built at launch, before any window is visible.

## Fix

Build the subtitle panel without `.no_activate(true)`: keep the nonactivating style, `focusable(false)`,
`focused(false)`, `visible(false)` and `_setPreventsActivation:`. `show()` also calls
`NSApp.unhideWithoutActivation` when the app is hidden (`src-tauri/src/subtitle_window.rs`).

## Guardrail

A panel created at runtime must not change the activation policy. Grep for `no_activate(true)` before adding a panel
that is built after launch, and test a cold first start of that panel with the main window open.
