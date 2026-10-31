---
type: lesson
category: error
scope: speakease
tags: [area/testing, surface/web, playwright]
summary: "Playwright element screenshots of a section with a horizontal scroll track or fixed header can reset the track and draw fixed elements in the wrong place; take viewport screenshots for state evidence."
status: active
superseded_by:
last_verified: 2026-10-31
---
# Playwright element screenshots distort scroll state

## Trigger
Landing page design-edit, 2026-10-31: `locator('#features').screenshot()` after walking the card scroller to card 4
showed card 1 with stale dots. Demo element shots showed the skip link visible and the header shifted down.

## Root cause
Element screenshots scroll/resize to fit the element: the scroll-snap track reset to `scrollLeft` 0 (state read
afterwards: dot 0, prev disabled), and fixed elements are composited relative to the enlarged capture. In the live
page the skip link's bottom edge stayed at −24 px (measured at load, after a click and after Tab).

## Fix
Card evidence recaptured with `page.screenshot()` (viewport) after a 1.3 s settle; state read from the DOM before the
capture.

## Guardrail
For carousel, pinned-scroll or fixed-header states, use viewport screenshots and log the DOM state next to each one;
treat an element shot that contradicts the logged state as a capture artefact until a viewport shot says otherwise.
