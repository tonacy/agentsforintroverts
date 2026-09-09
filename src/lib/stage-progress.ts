/**
 * The maths behind the opening stage. Pure functions, no DOM, so they run
 * under vitest and the component only has to measure and apply.
 */

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * A stage is a tall wrapper (`height`) whose first child is sticky and one
 * viewport high. Progress is how far the wrapper has scrolled through the
 * extra height that keeps the child pinned: 0 when the wrapper's top reaches
 * the top of the viewport, 1 when the child is about to unstick.
 */
export function stageProgress(
  top: number,
  height: number,
  scrollY: number,
  viewport: number,
): number {
  const travel = height - viewport;
  if (travel <= 0) {
    return scrollY >= top ? 1 : 0;
  }
  return clamp01((scrollY - top) / travel);
}

/** How fast the sea runs at a given progress. It slows but never stops. */
export function seaRate(p: number): number {
  return 1 - 0.92 * clamp01(p);
}

/** 0 -> 1 -> 0 hat with a flat top between `inStart..inEnd` and `outStart..outEnd`. */
function window01(p: number, inStart: number, inEnd: number, outStart: number, outEnd: number): number {
  if (p <= inStart || p >= outEnd) return 0;
  if (p < inEnd) return clamp01((p - inStart) / (inEnd - inStart));
  if (p <= outStart) return 1;
  return clamp01((outEnd - p) / (outEnd - outStart));
}

export type StageLayers = {
  /** "Out there, the feeds never stop." */
  lineA: number;
  /** "In here, we get a slow one." */
  lineB: number;
  /** The cue that hands over to today's ledger. */
  ledger: number;
  /** Opacity of the sea of fragments. */
  seaOpacity: number;
  /** How far the sea has parted around the channel, 0..1. */
  spread: number;
};

/**
 * The beat sheet, as a function of progress. Line A on arrival; the sea
 * begins to part as it fades; line B holds the middle; the ledger cue takes
 * the last third while the sea settles to a quiet ground.
 */
export function stageLayers(progress: number): StageLayers {
  const p = clamp01(progress);
  return {
    lineA: window01(p, -1, 0, 0.22, 0.34),
    lineB: window01(p, 0.34, 0.42, 0.58, 0.68),
    ledger: window01(p, 0.7, 0.82, 2, 3),
    seaOpacity: 1 - 0.72 * p,
    spread: p,
  };
}
