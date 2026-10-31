# SpeakEase landing page

React + Vite, built in the same frame as the ReadEase landing page. Vietnamese at `/`, English at `/en/`. Both
entries are prerendered at build time and hydrated in the browser. No server runtime and no storage beyond the
remembered theme. The macOS application is unchanged. Decisions: `docs/product/decisions.md` (2026-10-31); spec:
`docs/product/specs/2026-10-31-landing-page.md`.

## Develop and verify

Requires [Bun](https://bun.sh/). From the repository root:

```sh
bun install --cwd site
bun run --cwd site dev
```

Development uses http://127.0.0.1:4174/ with a strict port. In development the stylesheet is injected by script, so
the hero shows a moment after load; check timing on the production preview instead:

```sh
bun run --cwd site verify
bun run --cwd site preview
```

`verify` runs behaviour/SSR tests, builds both entries, then checks the built output: matching locales, prerendered
hero, screenshot size, relative URLs that exist, and the notices file. The root CI does not lint or test `site/`.

## Owners

- `src/content.js`: VI/EN copy, alt text and FAQ. Both locales have the same shape (tested). Every claim is one that
  0.1.1 ships; unreleased work (meeting notes, live subtitles, the on-device model) is refused by a test.
- `src/App.jsx`: Header (floating pill), Hero, Laptop + Pill (the scroll demo), Features (card scroller), Compare,
  Install, FAQ, Closing and Footer.
- `src/story.js`: the pinned three-step demo (hold → speak → release) on GSAP ScrollTrigger, and its cleanup.
- `src/release.js`: trusted GitHub release validation; anything else keeps the `/releases/latest` link.
- `src/analytics.js`: GA4, off while `GA_ID` is empty, on localhost, and under Do Not Track.
- `src/icons.js`: glyphs copied verbatim from the app's `src/components/icons/bulk.tsx`; `apple`, `sun`, `moon`,
  `plus`, `download` from the ReadEase landing page. The GitHub mark is WAVE icon 36806:44460.
- `style.css`: imports the app's `src/styles/theme.css` (WAVE neutrals, SpeakEase pink) and maps it onto a few
  page tokens. No colour literals, no gradients, no `infinite` animation (tested).
- `vite.config.mjs`: static rendering and the only repository files the page copies (the icon 0.1.1 installs and
  the `{vi,en}-{history,speak}.png` screenshots).

## Design contract (owner, 2026-10-31)

- One title per card; no eyebrow or description stacks; no gradients; few words.
- Dark ink download button; pink marks the product (hero line, pill, SpeakEase column).
- The demo is drawn in CSS on `media/wallpaper.jpg` (Apple's macOS 27 wallpaper, supplied by the owner; see
  decisions.md): hold ⌥ Space, speak, release, and the sentence lands in a two-pane Notes window. The pill copies
  the app's compact overlay (`src/overlay`). It pins at 720 px+
  wide and 600 px+ tall with motion allowed; elsewhere it shows the result and the numbered tabs switch steps.
  Without JavaScript the steps are a plain list.
- The comparison only states facts a reader can check; two dated notes under it, without footnote numbers (owner).
- The card scroller drags with the mouse (touch swipes natively) and lands on the nearest card past 15 % of a
  card; over it a fine pointer becomes a round ink badge with WAVE's left/right arrows. Arrows, dots and keyboard scrolling stay.
- Light and dark follow the system; the header toggle overrides it (`speakease-site-theme` in localStorage).

## Publishing

`.github/workflows/pages.yml` runs only by hand: running it is a deploy, and the owner has not approved one yet.
Pages must be enabled for the repository first. The website's short path `/speakease` (publishing company) will
redirect here once the final URL exists.

## Dependencies

Runtime: React/React DOM 19.3.0, GSAP 3.15.0. Build: Vite 8.3.0, tsx 4.23.15. Pinned in `bun.lock`. GSAP uses its
own [Standard No Charge License](https://gsap.com/standard-license/), not MIT; the build emits installed notices in
`THIRD_PARTY_LICENSES.txt`. SpeakEase's licence does not relicense dependencies.

Built output is about 1.1 MB including both screenshot sets. Initial JS is about 85 KB gzip; GSAP and ScrollTrigger
load on demand (about 44 KB gzip).
