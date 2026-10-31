---
id: speakease-spec-2026-10-31-landing-page
type: spec
product: speakease
title: "SpeakEase — Landing page (spec)"
status: draft                 # draft → approved → building → verified → shipped
updated: 2026-10-31
summary: "A Vietnamese/English landing page in site/ (React + Vite + GSAP, ReadEase's frame in SpeakEase pink): a scroll demo of press-listen-write, four feature cards, a checkable comparison, install steps and FAQ; 0.1.1 features only; published after owner approval."
tags: [area/publish, area/i18n, area/analytics, stack/react, surface/web]
figma: []
relations:
  derivedFrom: [speakease-decisions, speakease-goal]
  changes: [SE-SITE-001, SE-SITE-002, SE-SITE-003, SE-SITE-004, SE-SITE-005, SE-SITE-006, SE-SITE-007, SE-SITE-008]
---
# SpeakEase — Landing page (spec)

Owner round 1 (`decisions.md`, 2026-10-31) decided every item below. Built locally on branch
`claude/speakease-landing-dccd79`; not published.

## Why
- SpeakEase 0.1.1 has a release page on GitHub and nothing else. A Vietnamese speaker who hears about it needs one page
  that shows the idea in seconds (hold a key, speak, the text lands) and downloads the right file.
- The publishing company's 29/10 request for a download page on the website becomes a short `/speakease` redirect to
  this page (owner, 31/10).

## Owner decisions this spec follows
| Item | Status | Decision |
|---|---|---|
| Where | DECIDED | Own GitHub Pages page; website `/speakease` redirects to it |
| Languages | DECIDED | Vietnamese at `/`, English at `/en/` |
| Hero | DECIDED | "Gõ ít đi, nói nhiều hơn." |
| Version | DECIDED | Only what 0.1.1 ships |
| Primary action | DECIDED | Newest `.dmg`, following each release |
| Look | DECIDED | ReadEase frame, SpeakEase pink, one title per card, few words |
| Images | DECIDED | Existing app screenshots + CSS recording pill animated on scroll |
| Stack | DECIDED | React + Vite + GSAP (new dependencies of `site/` only) |
| Analytics | DECIDED | GA4 like ReadEase, skipped under Do Not Track |
| Release | DECIDED | Local preview first; published only after the owner approves |
| CTA colour | AI default, not owner-confirmed | Dark ink button, as ReadEase; pink marks the product |
| GA4 stream ID | OPEN | Needs a SpeakEase web stream; analytics stay off until then |
| Point-of-view card | OPEN | `goal.md` has none (inbox 2026-10-27); the design review ran without it |

## Change
| REQ-ID | Add / edit / deprecate | Rule after the change | Kind |
|---|---|---|---|
| SE-SITE-001 | Add | `/` (vi) and `/en/` (en) are prerendered with their own `lang`, title, description, hreflang and hero text; both locales have the same content shape. | functional |
| SE-SITE-002 | Add | Every download button starts as `…/releases/latest`; it switches to a `.dmg` only when the GitHub API returns a stable release whose `-arm64.dmg` URL is https on `github.com` under `/wblekhoa/speakease/releases/download/` with a positive size. Any failure keeps the fallback. | contract |
| SE-SITE-003 | Add | The demo shows three steps (press the shortcut, listen, write; owner 31/10). It pins on scroll only at ≥ 720 px wide, ≥ 600 px tall and motion allowed; otherwise it shows the result and the tabs switch steps; without JavaScript the steps are a list. | functional |
| SE-SITE-004 | Add | The page names only features 0.1.1 ships; meeting notes, subtitles, the on-device model and "coming soon" never appear. | contract |
| SE-SITE-005 | Add | The comparison with Telex and Mac Dictation states only checkable facts, with dated notes under it (no footnote numbers, owner 31/10) for Apple's language list and for AI needs. | quality |
| SE-SITE-006 | Add | Light and dark follow the system with a manual toggle; no horizontal overflow at 375 px; colours come only from the app's `theme.css`, no gradients, no `infinite` animation. | quality |
| SE-SITE-007 | Add | Analytics load only with a GA4 ID, off localhost, and without Do Not Track. | contract |
| SE-SITE-008 | Add | The licence (PolyForm Noncommercial, Handy MIT) and the AI cleanup requirement (Apple Intelligence or the user's own API key) are visible on the page. | contract |

## Scope
- New: `site/` (its own `package.json` and `bun.lock`), `.github/workflows/pages.yml` (manual only).
- Reads, never edits: `src/styles/theme.css`, `assets/brand/speakease-icon.svg`, `assets/screenshots/{vi,en}-{history,speak}.png`.
- The app, its CI (`eslint src`, `tsc` on `src`) and its release scripts are untouched.
- Non-goals: privacy, Vietnamese WER and shortcut tables as sections (owner did not pick them); deploying; the website
  redirect (publishing company, via its inbox).

## Acceptance
- `bun run --cwd site verify`: behaviour/SSR tests (SE-SITE-001…008) and built-output tests pass.
- Built preview in Chromium at 1280 and 375 px, light and dark, VI and EN: no horizontal overflow, no console errors,
  three `.dmg` links per route with a mocked release.
- `wave:review` on `site/style.css` and `site/src/App.jsx`: no `hand-rolled-icon` error; remaining findings answered.
- `jak-hq:design-edit` fresh review: disposition and verdict recorded below.
- Owner approves the local preview before any deploy.

## Change log
- 2026-10-31: created (draft); filled from owner round 1. Stays draft until the owner approves the preview (gate 1).
- 2026-10-31: design-edit with a fresh reviewer: disposition `fix`. Resolved: demo end state (recaptured; the text lands
  after ~2 s), cards 3-4 and open FAQ captured, a scroller bug it exposed (at 1280 px the last card was unreachable
  by index; `cardIndex` + test), "no" (×) vs "does not apply" (—) marks, readable footnote markers, no animated layout
  properties (slop-09). Open for the owner: centred section headings (slop-05, inherited from the ReadEase frame) and
  the missing point-of-view card in `goal.md`. Evidence receipt accepted with independent review.
- 2026-10-31: owner changed the demo flow to Bấm phím tắt → Lắng nghe → Viết nội dung (SE-SITE-003 wording).
