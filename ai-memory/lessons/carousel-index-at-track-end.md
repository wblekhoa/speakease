---
type: lesson
category: error
scope: speakease
tags: [area/layout, stack/react, surface/web, carousel]
summary: "A scroll-snap carousel that shows several cards at once ends before the last card reaches the left edge; derive the index from 'at the track end' too, or the last card and 'next' never resolve."
status: active
superseded_by:
last_verified: 2026-10-31
---
# Carousel index at the track end

## Trigger
Landing page (`site/`), design-edit review 2026-10-31: at 1280 px the card scroller's last dot never lit and the
"next" arrow stayed enabled. Measured: max scrollLeft 1016 px, stride 544 px (520 px card + 24 px gap), so the walk
went 0 → 1 → 2 and stopped short of 3.

## Root cause
`Math.round(scrollLeft / stride)` assumes one card per view. With three of four cards visible the track can scroll
only ~1.9 strides, so the computed index tops out at 2 and index 3 is unreachable. After the fix the walk is
0 → 1 → 3 at 1280 px (dot 3 never lights there, a known minor) and 0 → 1 → 2 → 3 on phones.

## Fix
`cardIndex(left, max, stride, count)` in `site/src/App.jsx` returns the last index when `left >= max - 2`; unit test
in `site/tests/site.test.jsx` (1280 and 375 cases). Commit on branch `claude/speakease-landing-dccd79`.

## Guardrail
Any scroll-derived carousel index: test the widest layout as well as the phone, and assert that "next" disables at
the end. ReadEase's landing scroller uses the same formula; check it the next time that page is touched.
