# Landing-page implementation

Implemented after the user authorized commit and redeployment on September 4, 2026. This supersedes the Figma-only implementation status in the earlier design handoff.

The homepage now implements the reviewed opening and five supporting sections. Shared navigation and footer follow the new layout, including all three visible mobile navigation destinations. Existing manifesto and Made with reading bodies remain intact. The Field notes section retains an explicit preparation state and sends subscriptions to the existing Substack publication.

The ink surface and vessel are separate assets. The water PNG is an exact 2x export of the visible Figma calm-water layer, including its reviewed image adjustments and 0.68 alpha. Its browser opacity track is therefore normalized to 1 at rest; Multiply blending happens against the paper-filled scene. The vessel comes from the original exported brand mark. The blank image returned for the shared hidden Figma image was discarded.

Motion uses the exported Figma CSS values with shared identical tracks and parameterized fragment destinations. All 48 animated nodes are represented. Geometry is responsive within the same 540 x 468 coordinate space. The 7.2-second opening plays once per session, then stays still. The Figma export's loop metadata is intentionally overridden by the reviewed once-per-session contract. Title and actions remain available throughout. Mobile, reduced motion, direct anchors, and no-JavaScript rendering retain the calm view. Changing motion preference during playback settles immediately; Skip opening settles and focuses the heading.

Validation: the complete repository release suite passed (113 JavaScript tests, 33 Swift tests, lint, build, and static export checks), as did the Hub typecheck. The 29 browser checks in browser-checks.json cover initial/return visits, settling, primary-action availability during motion, skip/focus, reduced motion at load and during playback, explicit anchors, desktop and 390px/320px routes, navigation visibility, no-JavaScript fallback, and runtime errors. Chrome browser checks do not certify physical-device performance or assistive-technology behavior.

The independent browser review is in independent-review/local-browser-review.md. Release identity is supplied by the built /version.json and must match the deployed Git commit.
