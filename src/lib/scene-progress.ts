/**
 * The view-progress maths behind `ScrollScene`'s observed tier.
 *
 * It lives here, apart from the component, for one reason: it is pure
 * arithmetic and it must stay identical to what a native `ViewTimeline`
 * reports, so it needs to be executable by `node --test` without a JSX
 * toolchain. `ScrollScene` imports it and re-exports it unchanged.
 */

/**
 * Where in the scene's pass across the viewport progress runs 0 -> 1.
 * These mirror the CSS `animation-range` keywords exactly, so the native tier
 * and the observed tier agree to the pixel.
 *
 *   cover   — from the moment the scene's top edge reaches the bottom of the
 *             viewport until its bottom edge leaves the top. The default.
 *   contain — only while the scene is wholly inside the viewport (or, for a
 *             scene taller than the viewport, wholly covering it).
 *   entry   — the arrival half: cover start -> contain start.
 *   exit    — the departure half: contain end -> cover end.
 */
export type ScrollSceneRange = "cover" | "contain" | "entry" | "exit";

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Pure maths — no DOM reads — so the rAF tick never touches layout.
 *
 * `top` is the scene's offset in document space, `height` its measured height.
 * `offset` is the element top expressed relative to the viewport top, which is
 * the same quantity the CSS view-progress timeline is defined against.
 */
export function sceneProgress(
  top: number,
  height: number,
  scrollY: number,
  viewport: number,
  range: ScrollSceneRange,
): number {
  const offset = top - scrollY;

  const coverStart = viewport;
  const coverEnd = -height;
  const containStart = Math.max(viewport - height, 0);
  const containEnd = Math.min(viewport - height, 0);

  let start = coverStart;
  let end = coverEnd;

  if (range === "contain") {
    start = containStart;
    end = containEnd;
  } else if (range === "entry") {
    start = coverStart;
    end = containStart;
  } else if (range === "exit") {
    start = containEnd;
    end = coverEnd;
  }

  const span = start - end;

  // A range can collapse to a single scroll position. `contain` does it when
  // the scene is exactly as tall as the viewport — a full-height act is an
  // obvious shape, so this is reached in practice, not in theory. A native
  // ViewTimeline degenerates to a step there: 0 until the scene reaches the
  // collapsed position, 1 from that position on (measured in Chrome 152, the
  // flip is exactly at offset === start). Returning a flat 1 instead, as this
  // did, made the observed tier show a scene as finished before it arrived.
  if (span <= 0) {
    return offset > start ? 0 : 1;
  }

  return clamp01((start - offset) / span);
}
