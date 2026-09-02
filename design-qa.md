# Design QA — Navigational shelter identity

## Target and implementation

- Selected source visual: `/Users/tonyll/.codex/generated_images/01a01a87-7b15-7252-9a66-7f693a543e1b/exec-bc82b02d-b81d-430d-8d00-e8e73fb77cd5.png` (1254×1254).
- Production mark: `public/brand/navigational-shelter-mark.png` (512×512 RGBA).
- Desktop implementation capture: `design/qa/navigational-shelter-home-desktop-final.png` (1280×720).
- Mobile implementation captures:
  - `design/qa/navigational-shelter-home-mobile.png` (390×844).
  - `design/qa/navigational-shelter-manifesto-mobile.png` (390×844).
- Social implementation:
  - `src/app/opengraph-image.png` (1200×630).
  - `src/app/manifesto/opengraph-image.png` (1200×630).
- Small-icon implementation:
  - `src/app/favicon.ico` (32×32 embedded PNG).
  - `src/app/icon.png` (512×512).
  - `src/app/apple-icon.png` (180×180).

## Inspection state

- Root page inspected after the opening animation settled.
- Desktop viewport: 1280×720.
- Responsive viewport: 390×844, then reset to the browser default.
- Navigation exercised from root to Manifesto, from Manifesto to Made with, and back home through the brand link.
- Manifesto and Made with correctly exposed their current-page states.
- The mark loaded from the same production asset on every inspected route.
- Mobile horizontal overflow: 0px.

## Fidelity normalization

- The source is a square identity board rather than a page mockup, so layout fidelity applies to the mark, palette, and wordmark character—not to the existing site composition.
- The production master is 512px and renders at 28 CSS px in navigation. The lockup uses Newsreader at 15 CSS px to preserve the selected source's humanist serif character.
- Screenshots are browser captures at their stated CSS viewports. No density-dependent pixel comparison was used to judge scale.

## Visual comparison evidence

- Full context: `design/qa/navigational-shelter-comparison-full.png` places the selected board and the implemented desktop page in one comparison image.
- Focused region: `design/qa/navigational-shelter-comparison-focused.png` compares the selected mark and serif wordmark directly with the production navigation lockup.
- Root and manifesto social cards were separately inspected at their exported 1200×630 dimensions.
- The 32px favicon was inspected at native size; the open vessel and two-current silhouette remain recognizable.

## Findings and corrections

1. **Resolved — P2:** The first implementation inherited a 24px icon and monospaced wordmark. At that scale the mark could read as a bow tie. The final lockup increases the mark to 28px and uses the site's Newsreader serif, restoring the intended vessel-and-current reading.
2. **Accepted — P3:** Local development emitted Next.js's existing smooth-scroll annotation warning during route transitions. No console errors occurred, navigation remained correct, and the warning is unrelated to the identity assets.
3. No clipping, broken assets, illegible social-card copy, unexpected layout shifts, or responsive overflow were found.

## Verification

- `npm run brand:build` — passed.
- `npm run lint` — passed.
- Next.js production build under Node 22.23.2 — passed, including TypeScript and metadata routes.
- `node scripts/verify-site.mjs` under Node 22.23.2 — passed for the static export.
- Next.js file-convention guidance for app icons and Open Graph images was checked against the installed Next.js version.

## Comparison history

- Pass 1: production asset worked, but the 24px monospaced navigation lockup weakened the selected concept.
- Pass 2: 28px mark plus Newsreader lockup matched the selected identity and passed desktop, mobile, navigation, favicon, and social-card checks.

final result: passed
