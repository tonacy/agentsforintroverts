**Comparison target**

- Source visual truth:
  - `design/brand/network-focus-root-master.png` (1729×910)
  - `design/brand/network-focus-manifesto-master.png` (1731×909)
  - `design/brand/network-focus-favicon-source.png` (1254×1254)
- Implemented assets:
  - `src/app/opengraph-image.png` (1200×630)
  - `src/app/manifesto/opengraph-image.png` (1200×630)
  - `src/app/icon.png` (512×512)
  - `src/app/apple-icon.png` (180×180)
  - `src/app/favicon.ico` (16, 32, and 48 px layers)
- State: static root social card, static manifesto social card, and network-focus icon system.
- Viewport and density: social artwork normalized to 1200×630 at 1×; icon outputs inspected at their native 512, 180, 48, 32, and 16 px sizes. CSS viewport is not applicable to these file-based metadata assets.
- Local preview: `/`, `/manifesto/`, both route-scoped social images, and the favicon returned HTTP 200. No browser automation was used because a browser choice was not established.

**Full-view comparison evidence**

- Root, source on the left and implementation on the right:
  `design/qa/network-focus-root-comparison.png` (2424×630).
- Manifesto, source on the left and implementation on the right:
  `design/qa/network-focus-manifesto-comparison.png` (2424×630).
- Icon, optically corrected source on the left and production icon on the right:
  `design/qa/network-focus-icon-comparison.png` (1048×512).

The source social artwork was center-cropped by less than one percent and
downsampled to the production target before comparison. The implementation
preserves the graph topology, central focus point, hierarchy, copy, palette,
and line quality of the selected source.

**Focused-region evidence**

- Small preview checks:
  - `design/qa/network-focus-root-300x158.png`
  - `design/qa/network-focus-manifesto-300x158.png`
- Center-square fallback crops:
  - `design/qa/network-focus-root-square.png`
  - `design/qa/network-focus-manifesto-square.png`
- Native favicon layers:
  - `design/qa/network-focus-favicon-16.png`
  - `design/qa/network-focus-favicon-32.png`
  - `design/qa/network-focus-favicon-48.png`

The title and central focus remain legible at 300×158. Center-square crops keep
the title, pinch, and principal message intact. All six outer nodes and the
dominant focus node remain distinguishable in the corrected 16 px layer.

**Findings**

- No remaining P0, P1, or P2 differences.
- Fonts and typography: the rasterized display hierarchy and generated letterforms match the approved source after normalization; headline wrapping is unchanged and remains readable in the small-preview and square-crop checks.
- Spacing and layout rhythm: the center point remains optically centered; the opposing graph fields keep their intended symmetry and breathing room; production cropping does not remove essential content.
- Colors and visual tokens: the cards retain warm paper, black ink, pale network lines, and forest focus. The standalone icon is flattened to the site tokens `#FDFBF7` and `#0F4A38` with no transparency risk in dark browser chrome.
- Image quality and asset fidelity: social cards are opaque 1200×630 PNGs below 1 MB. No generated illustration was replaced by CSS, HTML, or handcrafted SVG. The icon is a real generated asset with an optical small-size master.
- Copy and content: root and manifesto card copy matches the selected artwork exactly. Metadata alt text describes the topology instead of treating it as a literal hourglass or timer.

**Comparison history**

1. Initial favicon reduction — blocked by one P2 finding: the first automatic
   16 px downsample read as a bow tie or insect because the center was too weak
   and branch gaps fragmented.
2. Fix — generated a favicon-specific optical master with a larger central
   point, heavier joined branches, tighter horizontal occupancy, flat colors,
   and the same six-node topology.
3. Post-fix evidence — the 16, 32, and 48 px files listed above were inspected
   at native size. The 16 px layer now preserves two graph fields converging on
   one dominant focus point; no P0, P1, or P2 finding remains.

**Open questions**

- None for the asset implementation. Live social-platform cache refresh and OS-specific tab rendering are release checks, not source-to-implementation design mismatches.

**Implementation checklist**

- [x] Root and manifesto artwork exported at 1200×630.
- [x] Route-scoped Open Graph and Twitter images installed.
- [x] 512 px icon and 180 px Apple icon installed.
- [x] Multi-layer 16/32/48 favicon installed.
- [x] Navigation uses the network-focus mark.
- [x] Small-preview and center-square crops inspected.

**Follow-up polish**

- P3: inspect the favicon in the chosen browser's real light and dark tab chrome after deployment.

Asset-system result: passed

---

## Motion update: network noise to human focus

**Comparison target**

- Source visual truth: `design/qa/before-motion-bloom.png` (1280×720). This is the former 4.7-second resolution frame, where a warm radial bloom cleared the feed.
- Implemented desktop states:
  - `design/qa/after-motion-overwhelm.png` (1280×720)
  - `design/qa/after-motion-hold.png` (1280×720)
  - `design/qa/after-motion-funnel.png` (1280×720)
  - `design/qa/after-motion-focus.png` (1280×720)
  - `design/qa/after-motion-resolve.png` (1280×720)
  - `design/qa/after-motion-settled.png` (1280×720)
- Implemented mobile states:
  - `design/qa/after-motion-mobile-overwhelm.png` (375×812)
  - `design/qa/after-motion-mobile-funnel.png` (375×812)
  - `design/qa/after-motion-mobile-focus.png` (375×812)
  - `design/qa/after-motion-mobile-settled.png` (375×812)
- Human-focus asset: `design/brand/human-focus-source.png` (1254×1254 transparent source) and `public/brand/human-focus.png` (256×256 transparent runtime asset), inspected at 32×32 and 24×24 in `design/qa/`.
- CSS viewports and density: 1280×720 desktop and 375×812 mobile, both captured at 1× CSS density with screenshots normalized to their native viewport pixels.
- State: first visit in a session. Checkpoints cover full feed pressure, the 300 ms still hold, horizontal convergence, central human focus, landing reveal, and settled page.

**Full-view comparison evidence**

- `design/qa/motion-desktop-comparison.png` (3840×720): former bloom, revised funnel at the equivalent moment, then revised human-focus state in one combined comparison.
- `design/qa/motion-mobile-comparison.png` (750×812): mobile funnel and human-focus states in one combined comparison.

The combined desktop comparison makes the semantic change visible: the source reads as illumination clearing the center, while the implementation preserves the noise and physically compresses it into a single human-scale point. The mobile comparison confirms the same story remains legible in the narrow viewport.

**Focused-region evidence**

- `design/qa/human-focus-32.png` and `design/qa/human-focus-24.png` verify that the generated marker stays recognizable without a face, gender cue, enclosing avatar circle, or transparency halo.
- The mobile browser geometry check measured zero horizontal overflow, six visible feed lanes, an exactly centered focus marker, and a 100×44 px skip control target.

**Findings**

- No remaining P0, P1, or P2 findings.
- Fonts and typography: the feed retains IBM Plex Mono and the landing retains the Newsreader hierarchy. No copy or wrapping changed except the already-selected field-notes capture line.
- Spacing and layout rhythm: the focus point stays centered; the settled gutters and landing composition are unchanged; mobile reduces nine feed lanes to six so the convergence reads instead of becoming a uniform wall.
- Colors and visual tokens: the warm sun color was removed. The focus marker uses the existing forest ink and the transition resolves into paper, without glow, blur, shadow, or a new palette.
- Image quality and asset fidelity: the human marker is a real transparent raster asset generated for the 24–32 px slot, not CSS/div/SVG art. Its geometry remains clear at both target reductions.
- Copy and content: landing copy is unchanged by this motion update. “Skip opening” is literal and understandable without explaining the metaphor.
- Interaction and accessibility: the 7.2-second sequence remains once per session and retains reduced-motion bypass. A visible “Skip opening” button satisfies the stop/hide requirement for longer auto-running motion; activation synchronously settles the page and moves focus to the H1. A same-tab reload does not replay. Hidden landing controls remain unavailable during playback. The skip control is 100×44 px on mobile.
- Performance: the convergence animates grouped wrappers with transform and opacity. Explicit `will-change` was removed from repeated text and landing elements and retained only on the three grouped transition layers.
- Browser evidence: skip activation, intentional H1 focus, same-session reload, 375×812 overflow/lane geometry, and desktop/mobile visual checkpoints were tested. Desktop and mobile consoles returned no warnings or errors.

**Comparison history**

1. Initial source frame — blocked by one P1 semantic mismatch: the warm expanding bloom read as light breaking through, not network noise being reduced to human focus.
2. First implementation — replaced the bloom with grouped inward compression and a generated gender-neutral human marker; desktop and 375×812 comparisons showed the intended noise → funnel → person progression.
3. Accessibility refinement — one P2 finding remained: the visually subtle skip control had a touch target smaller than 44 px.
4. Fix — expanded the real button target to 100×44 px while preserving the restrained underlined treatment.
5. Post-fix evidence — desktop and mobile focus frames were recaptured, mobile geometry confirmed the 100×44 target and zero overflow, and the combined comparison images were rebuilt. No P0, P1, or P2 finding remains.

**Open questions**

- None for the selected motion direction. Live OS-level reduced-motion emulation was not available in the chosen in-app browser; the unchanged preference gate, updated reduced-motion CSS, lint, TypeScript, production build, and full project verification all passed.

**Implementation checklist**

- [x] Preserve the overwhelming feed build and 300 ms hold.
- [x] Replace the sunrise/bloom resolution with inward convergence.
- [x] Resolve the central point into a gender-neutral human marker.
- [x] Preserve once-per-session and reduced-motion behavior.
- [x] Add an accessible skip/stop path with intentional focus placement.
- [x] Reduce mobile feed lanes and verify zero horizontal overflow.
- [x] Inspect desktop and mobile visual checkpoints and console output.
- [x] Run the complete project verification suite and production build.

**Follow-up polish**

- P3: test the reduced-motion branch in a browser configured at the OS level during pre-release QA.

final result: passed

---

## Motion correction: visible vertical hourglass

This correction supersedes the earlier motion verdict above. The previous
`after-motion-funnel.png` frame is now source evidence of the rejected state,
not an approved final: it compressed the feed on the x-axis into a narrow
vertical strip and never formed the requested hourglass.

**Corrected sequence**

- 4.35–4.90s: the full noise field carves into a conventional hourglass,
  broad at the top and bottom and pinched around the 48% human-focus line.
- 4.90–5.20s: the complete hourglass holds for 300ms so the shape reads.
- 5.20–5.40s: the upper and lower fields converge vertically into one
  full-width thread; there is no x-axis compression during this beat.
- 5.40–5.50s: that thread contracts into the human marker.
- 5.50–5.70s: the remaining noise fades; the landing then resolves without a
  glow or sunrise.

**Comparison and findings**

- P1 source mismatch: `design/qa/after-motion-funnel.png` visibly reads as a
  vertical column. The live corrected 1280×720 checkpoint at 4.95s visibly
  reads as an hourglass; the 5.36s checkpoint reads as top-and-bottom
  convergence; the 5.48s checkpoint resolves to the centered human marker.
- The same 4.95s hourglass was inspected live at 375×812. It retained the
  top/bottom silhouette with six feed lanes and measured zero horizontal
  overflow.
- Sparse arrival labels now fade before the hourglass locks, leaving the one
  permanent feed field to define the silhouette and avoiding a second
  full-screen clipping animation.
- The corrected field uses one eight-point polygon morph with matching vertex
  counts, then grouped transforms and opacity. This is bounded to the
  once-per-session opening.
- The 7.2-second completion state was rechecked: opening state cleared,
  headline and capture were visible at opacity 1, page overflow was zero, and
  the browser console had no warnings or errors.
- The real skip control was rechecked after the timing change. It immediately
  cleared the opening, revealed the landing, and focused `#hero-headline`.
- Full `npm run verify`, ESLint, TypeScript, all web/protocol/hub/MCP tests, 26
  Swift tests, the integration contract, and the production Webpack build all
  passed outside the sandbox after the local Swift cache restriction was
  removed from the test environment.

**Remaining release check**

- P3: verify the single full-screen polygon morph on mobile Safari. The chosen
  in-app browser showed no aliasing or layout regression, but Safari may choose
  to repaint `clip-path` rather than composite it.

Corrected motion result: passed in the tested desktop and 375×812 in-app
browser states.
