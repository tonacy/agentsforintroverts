/**
 * The sea of feed fragments behind the opening. Everything here is
 * deterministic: the server renders the same columns the client animates.
 */

export const FRAGMENT_POOL = [
  "email · a reply",
  "calendar · an ask",
  "X · a mention",
  "email · a follow-up",
  "LinkedIn · an intro",
  "newsletter · a request",
  "X · a thread",
  "email · an invite",
  "calendar · a conflict",
  "LinkedIn · a message",
  "email · a nudge",
  "X · a quote",
  "group chat · a decision",
  "newsletter · a digest",
  "email · a cc",
  "X · a reply to a reply",
  "calendar · a hold",
  "LinkedIn · a congratulation",
  "email · a thread you were added to",
  "X · a take",
] as const;

export type SeaColumn = {
  /** Newline-joined fragments, `lines` long. */
  text: string;
  /** Relative vertical speed, 0.35..1.3. */
  speed: number;
  /** Starting offset as a fraction of the column height, 0..1. */
  phase: number;
  /** Signed distance from the centre column, -1..1. */
  spread: number;
};

/** Signed distance of column `index` from the centre of `count` columns. */
export function spreadFor(index: number, count: number): number {
  if (count <= 1) return 0;
  const half = (count - 1) / 2;
  return (index - half) / half;
}

/** A tiny deterministic PRNG so the grain is stable across renders. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSea({ columns, lines, seed = 1013 }: { columns: number; lines: number; seed?: number }): SeaColumn[] {
  return Array.from({ length: columns }, (_, columnIndex) => {
    const random = mulberry32(seed + columnIndex * 7919);
    const offset = Math.floor(random() * FRAGMENT_POOL.length);
    const stride = 1 + Math.floor(random() * 5);
    const text = Array.from(
      { length: lines },
      (_, lineIndex) => FRAGMENT_POOL[(offset + lineIndex * stride) % FRAGMENT_POOL.length],
    ).join("\n");

    const spread = spreadFor(columnIndex, columns);
    // Centre columns run faster: the torrent is deepest where the channel
    // will open. Random grain keeps neighbours from moving in lockstep.
    const speed = Number((0.45 + (1 - Math.abs(spread)) * 0.55 + random() * 0.28).toFixed(3));

    return {
      text,
      speed: Math.min(1.3, Math.max(0.35, speed)),
      phase: Number(random().toFixed(3)),
      spread: Number(spread.toFixed(3)),
    };
  });
}

/**
 * The wake a pointer leaves in the sea. `column` and `pointer` are fractions
 * of the viewport width; `strength` fades the effect as the channel opens.
 * Nearby columns step aside and slow down: in here, the feed makes way.
 */
export function seaWake(column: number, pointer: number | null, strength: number): { shift: number; slow: number } {
  if (pointer === null || strength <= 0) return { shift: 0, slow: 1 };
  const d = column - pointer;
  const reach = Math.exp(-((d / 0.085) ** 2));
  return {
    shift: Math.sign(d) * 46 * Math.exp(-(((Math.abs(d) - 0.035) / 0.07) ** 2)) * strength,
    slow: 1 - 0.62 * reach * strength,
  };
}
