# Agents for Introverts — Figma review handoff

Completed 2026-09-04. Status: editable design draft for review. Website implementation and motion execution remain separate work.

## Revision: ink water, replacing the repeated wave lines

The user rejected the previous water treatment as cheap. The current revision replaces those parallel vector lines with irregular forest-green ink ripples. The surface passes behind and immediately beneath the original vessel mark; foreground contrast is restrained and the caption sits closer to the illustration. The canonical mark is unchanged. This is a Figma design revision, not a website deployment.

The updated opening retains the current live animation's 7.2-second rhythm, including the 4.05–4.35-second held note. Readable fragments gather beside the headline, compress into lines, and become ocean currents beneath the selected ship mark. The ship settles by 7.2 seconds. The render includes a further 1.2-second still hold. All headline copy and actions remain still and available.

- [Play the editable Figma motion study](https://www.figma.com/design/ug0NTWkiC3bWzzWSvZn5e7?node-id=42-2)
- [Noise / Turning / Calm component states](https://www.figma.com/design/ug0NTWkiC3bWzzWSvZn5e7?node-id=38-188)
- [Current MP4 preview](screenshots/ocean-opening-v2.mp4): 1200 × 754, 30fps, 8.43 seconds.
- [Desktop opening](screenshots/home-opening-v2.png) and [mobile opening](screenshots/home-mobile-opening-v2.png).
- [Independent water re-review](independent-review/water-v2-review.md). Earlier screenshots, storyboard, video, and the original independent report are historical evidence of the superseded water treatment.

The main desktop and mobile homepage nodes are updated in place. Mobile places the static ocean after the reading actions. The prior desktop opening remains as a labeled reference on the Home page, node 39:118.

Validation for this revision: inspected desktop and mobile hero renders and sampled the new rendered transition and calm state at 5.2 and 7.5 seconds. The independent designer also inspected a fresh timeline export. Moved the fragments' final destinations up 40px to meet the raised water surface. Both updated heroes pass bounds and font checks. All four vessel layers retain the canonical image hash. The Figma study now contains animation tracks on 48 nodes. Website session behavior, reduced-motion handling, and keyboard controls remain specified, not implemented.

The water is a raster illustration in `water-ink-v2.png`, with native Figma Multiply blending, 68% opacity, exposure 0.12, contrast 0.12, and highlights 1. These settings remove the paper edge visually; the source PNG has no alpha channel. Preserve or reproduce the compositing settings during implementation. The mark, water, text, and motion remain separate layers. Scene dimensions are 540 × 468; caption Y is 384.

## Design

The homepage gives the public practice a clear sequence: participation without living in the feed, the incoming/outgoing lens, the Daily Conversation, the human boundary, the manifesto, then field notes. The manifesto remains the primary invitation while the first substantive field note is in preparation. Subscriptions use the existing Substack publication.

The selected Navigational Shelter mark is retained exactly. Warm paper, forest green, Newsreader reading typography, quiet rules, and open layouts connect the homepage to the complete manifesto and Made with disclosure. Quiet Desk is identified as a local prototype; product intentions are distinguished from current practice.

## Editable Figma destinations

[Open the Figma file](https://www.figma.com/design/ug0NTWkiC3bWzzWSvZn5e7).

| Deliverable | Desktop | Mobile |
| --- | --- | --- |
| Homepage | [1440px](https://www.figma.com/design/ug0NTWkiC3bWzzWSvZn5e7?node-id=12-2) | [390px](https://www.figma.com/design/ug0NTWkiC3bWzzWSvZn5e7?node-id=12-3) |
| Complete manifesto | [1440px](https://www.figma.com/design/ug0NTWkiC3bWzzWSvZn5e7?node-id=14-2) | [390px](https://www.figma.com/design/ug0NTWkiC3bWzzWSvZn5e7?node-id=14-19) |
| Made with | [1440px](https://www.figma.com/design/ug0NTWkiC3bWzzWSvZn5e7?node-id=18-96) | [390px](https://www.figma.com/design/ug0NTWkiC3bWzzWSvZn5e7?node-id=18-108) |

- [Getting started and brief](https://www.figma.com/design/ug0NTWkiC3bWzzWSvZn5e7?node-id=26-2)
- [Foundations](https://www.figma.com/design/ug0NTWkiC3bWzzWSvZn5e7?node-id=4-2): 29 variables across primitives, semantic colors, and spacing; 13 text styles; CSS token syntax.
- [Action components](https://www.figma.com/design/ug0NTWkiC3bWzzWSvZn5e7?node-id=7-23): primary, secondary, and link variants with default, hover, and focus states.
- [Navigation](https://www.figma.com/design/ug0NTWkiC3bWzzWSvZn5e7?node-id=8-30), [Editorial step](https://www.figma.com/design/ug0NTWkiC3bWzzWSvZn5e7?node-id=9-12), [Field notes](https://www.figma.com/design/ug0NTWkiC3bWzzWSvZn5e7?node-id=10-34), [Footer](https://www.figma.com/design/ug0NTWkiC3bWzzWSvZn5e7?node-id=11-40), and [Brand](https://www.figma.com/design/ug0NTWkiC3bWzzWSvZn5e7?node-id=4-71).
- [Motion, static path, and review notes](https://www.figma.com/design/ug0NTWkiC3bWzzWSvZn5e7?node-id=25-2).

## Rendered screenshots

All exports are local PNGs in the adjacent `screenshots` folder. These are inspection artifacts; the editable layouts are in Figma.

| Page | Desktop export | Mobile export |
| --- | --- | --- |
| Home | [home-desktop-v2.png](screenshots/home-desktop-v2.png) | [home-mobile-v2.png](screenshots/home-mobile-v2.png) |
| Manifesto | [manifesto-desktop.png](screenshots/manifesto-desktop.png) | [manifesto-mobile.png](screenshots/manifesto-mobile.png) |
| Made with | [made-with-desktop.png](screenshots/made-with-desktop.png) | [made-with-mobile.png](screenshots/made-with-mobile.png) |

Additional current exports: [opening](screenshots/home-opening-v2.png), [foundations](screenshots/foundations.png), and [motion](screenshots/motion.png).

## Validation completed

- Inspected rendered desktop and mobile sections and all six complete pages. Corrected text sizing, mobile navigation behavior, and focus ring rendering during review.
- Audited every descendant of the six page roots for horizontal/vertical overflow, empty text, unexpected fonts, and unbound solid fills: no issues found.
- Matched all 47 canonical manifesto paragraphs in both reading layouts. The 400 / 100 / 50 / 2–3 illustration explicitly states it is a thesis illustration, not measured product results.
- Audited all 29 variables for aliases, scopes, and CSS syntax. Tested Action label and Editorial step number/title/body properties on temporary instances and verified their rendered text.
- Inspected the retained 320px navigation stress instance and a narrow Editorial step instance. This supports core component flexibility; it is not a complete 320px page design or browser test.
- Verified foreground/background contrast for the used text colors: minimum tested ratio 6.22:1. Actions are at least 52px high; manifesto jump targets are 44px high. Visible focus geometry uses a 2px outline with 4px offset.
- Wired both homepage practice links and all twelve manifesto jump links to their corresponding Figma sections; read back the stored destinations. External route and Substack links retain their destinations. Prototype click-through has not been separately exercised.
- Enlarged the Field notes component-set bounds to contain all four variants with padding. Its post-publication variant is conditional documentation; active pages show the preparation state.

## Implementation handoff

All related layout groups use auto layout. Text uses height-based sizing; desktop reading columns and mobile layouts have distinct typography. The selected mark is the canonical embedded raster asset; text, layout, and components are native editable Figma objects.

Motion is demonstrated through a native Figma timeline, rendered playback, and a three-state storyboard. Copy and links appear immediately, while the desktop fragments resolve into an ocean over 7.2 seconds. Mobile and reading routes remain static. Reduced motion and no-script paths retain the same content and calm ocean. Keyboard skip-to-content behavior, semantic heading order, focus management, responsive browser behavior, and website animation execution must be verified during implementation.

The published homepage, manifesto, Made with route, and Substack About/archive were inspected. The archive still showed the older Coming soon entry. The design therefore does not claim that substantive field notes are publishing. Public manifesto text was verified before transfer; internal operational test details were omitted from the shared Figma brief after automatic review blocked their export.

The only local additions are this design handoff directory. No application code, source worktree, commit, deployment, or publication was changed. Detailed node identifiers are in `figma-state.json`; the source-grounded brief is in `brief.md`.
