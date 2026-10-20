---
type: lesson
category: error
scope: speakease
tags:
  [
    area/layout,
    area/input-events,
    stack/tauri,
    stack/appkit,
    surface/macos,
    nspanel,
  ]
summary: "A tauri-nspanel panel with the nonactivating style still activates the app on click; call _setPreventsActivation: (checked with respondsToSelector) on its NSWindow."
status: active
superseded_by:
last_verified: 2026-10-20
---

# A nonactivating panel still activated the app on click

## Trigger

Owner, 20/10: clicking the live-subtitle panel (a switch, ×, a drag) raised SpeakEase's main window over the video
being watched.

## Root cause

`tauri_nspanel::PanelBuilder` makes an ordinary Tauri window and turns it into an NSPanel afterwards; setting
`NSWindowStyleMaskNonactivatingPanel` on a window that already exists does not stop the window server from activating
the app on a click. `no_activate(true)` only covers showing it.

## Fix

`src-tauri/src/subtitle_window.rs` `prevent_activation`: `[nsWindow _setPreventsActivation:YES]`, after
`respondsToSelector:` (present on macOS 27, checked with a 5-line Swift probe). Commit `81c8e99`. The panel is also
ordered front with `order_front_regardless` each time subtitles start.

## Guardrail

Any clickable SpeakEase panel (the recording pill too) gets `prevent_activation`. Test by clicking it while another
app is frontmost and checking which app is active - not in the browser preview, which cannot show this.
