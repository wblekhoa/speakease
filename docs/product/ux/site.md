---
id: speakease-ux-site
type: ux
product: speakease
title: "SpeakEase — Landing page (UX)"
status: active
updated: 2026-10-31
summary: "What a visitor sees on the SpeakEase landing page, top to bottom, in Vietnamese and English: hero, scroll demo, feature cards, comparison, install, FAQ, closing; not published yet."
tags: [area/publish, area/i18n, stack/react, surface/web]
relations:
  specifies: [speakease:site/src/App.jsx, speakease:site/src/content.js]
  dependsOn: [speakease-spec-2026-10-31-landing-page]
---

# SpeakEase — Landing page (UX)

> Feature master for `site/`. Rules and REQ-IDs: `specs/2026-10-31-landing-page.md` (SE-SITE-001…008). Build and
> design contract: `site/README.md`. Not published: the owner approves the local preview first.

## Purpose
One page that shows the idea in seconds (hold a key, speak, the text lands where the cursor is) and downloads the right
file. Vietnamese at `/`, English at `/en/`; the header switches between them.

## Top to bottom
1. **Header** (floating pill, sticky): brand, four section links (hidden under 960 px), GitHub, theme toggle, language,
   a dark "Tải về / Download" pill.
2. **Hero**: "Gõ ít đi, / nói nhiều hơn." (second line pink), one sentence, a dark "Tải cho Mac" button, then
   Free · Apple Silicon (M1+) · On-device recognition.
3. **Demo**: a CSS laptop with a note titled "Cuối tuần". Scrolling walks three steps: hold ⌥ Space (the keys light
   pink, the recording pill shows a level), speak (the pill turns to "Đang chép lời…"), release (the sentence appears
   in the note). Numbered tabs under the laptop jump to a step. On phones and short windows the laptop shows the result
   and the tabs switch steps.
4. **Features** ("Không chỉ chép lời."): a card scroller with dots and arrows, one title per card. With a mouse it
   drags (a round "Kéo" badge replaces the pointer over it) and settles on the nearest card; on touch it swipes. AI cleanup (raw
   above, cleaned below, and the line that it needs Apple Intelligence or your own API key); translate while speaking
   (Vietnamese said, English pasted, ⌃ ⌥ Space); files and links (a 10-minute video in about 11 seconds); History
   (the app's screenshot).
5. **Compare** ("Gõ Telex, đọc chính tả của Mac, hay SpeakEase?"): six rows, the SpeakEase column tinted pink, two
   dated footnotes.
6. **Install** ("Cài trong một phút."): download the .dmg, drag to Applications, allow Microphone and Accessibility.
7. **FAQ**: seven questions (free and licence, privacy, which Macs, internet, best model, permissions, YouTube links).
8. **Closing**: "SpeakEase, miễn phí cho Mac.", the download button, version · size · .dmg.
9. **Footer**: Download / Project / Legal link groups, PolyForm Noncommercial line.

## States
- **Release lookup fails or is rate-limited**: every download link stays on GitHub's latest-release page; the closing's
  version · size line becomes a link to all releases.
- **No JavaScript**: everything is readable; the demo steps are a list and the card scroller scrolls natively.
- **Reduced motion**: no pinning, no reveal animations; the demo shows the result.
- **Theme**: follows the system until the visitor picks one; the choice is remembered on that browser.

## Change log
- 2026-10-31: created with the first build (owner round 1).
- 2026-10-31: owner asked for mouse drag with a custom cursor on the card scroller, and rounder demo keys.
