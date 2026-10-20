---
type: lesson
category: error
scope: speakease
tags: [area/layout, stack/react, stack/tauri, surface/macos]
summary: "When a window is sized to its content, measure the content's natural height, never a scroller that the window itself clamps - the window can then never grow."
status: active
superseded_by:
last_verified: 2026-10-20
---

# The subtitle panel never grew past its opening height

## Trigger

Owner, 20/10: the subtitle panel showed only the end of one bubble.

## Root cause

The page resized its window to the height of `.ls-content`, whose scroller is `min-height: 0` and clamped to the
window. Measured from inside the clamp, the height always equalled the window's opening 150 px, so the observer never
fired and the window never grew - a loop that only a real window shows (the browser preview has no window to fit).

## Fix

Measure an unclamped inner list (`.ls-list`) plus the pill, cap at the newest four bubbles, then resize the window and
keep its bottom edge (commit `7502073`, cap in `0b2981e`). Checked in the preview by forcing the frame to 120 px: the
scroller shrank to 58 px while the list still measured 161 px.

## Guardrail

For any self-sizing panel, test the measurement with the container forced smaller than the content; the measured
height must not change.
