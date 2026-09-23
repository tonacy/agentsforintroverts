/**
 * The beat sheet for the opening passage. One tall stage, scrubbed by scroll:
 * the feed, the slow one, your work arriving on the desk, the piece taking
 * shape, your mark, and the piece travelling out into the world.
 *
 * Pure functions of progress so the whole story is testable without a
 * browser; the component only measures, looks up a frame, and applies it.
 */

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Eased 0 -> 1 between `from` and `to`; exactly 0 before and 1 after. */
function ramp(from: number, to: number, p: number): number {
  const t = clamp01((p - from) / (to - from));
  return t * t * (3 - 2 * t);
}

/** Linear hat: rises over `inStart..inEnd`, holds, falls over `outStart..outEnd`. */
function hold(p: number, inStart: number, inEnd: number, outStart: number, outEnd: number): number {
  if (p <= inStart || p >= outEnd) return 0;
  if (p < inEnd) return clamp01((p - inStart) / (inEnd - inStart));
  if (p <= outStart) return 1;
  return clamp01((outEnd - p) / (outEnd - outStart));
}

export const LOOSE_PAGES = ["voice", "commit", "sketch", "note", "link"] as const;
export type LoosePage = (typeof LOOSE_PAGES)[number];

export type PassageFrame = {
  /** Opacity of each headline. */
  lines: { feed: number; slow: number; bring: number; shape: number; mark: number; travel: number; answer: number };
  sea: { rate: number; spread: number; opacity: number };
  /** Each loose page: how far it has dropped onto the desk, then into the piece. */
  loose: { drop: number; merge: number }[];
  page: { enter: number; title: number; deck: number; figure: number; body: number; colophon: number; notes: number };
  /** The signature line drawing itself, then the red chop landing. */
  signature: number;
  chop: number;
  /** The piece splitting into its forms, then travelling out. */
  forms: { split: number; travel: number };
  /** What comes back: a reply, a question, an invitation, among the feed. */
  arrivals: number;
};

export function passageAt(progress: number): PassageFrame {
  const p = clamp01(progress);
  const closing = ramp(0.86, 1, p);
  return {
    lines: {
      feed: hold(p, -1, 0, 0.1, 0.16),
      slow: hold(p, 0.115, 0.165, 0.25, 0.3),
      bring: hold(p, 0.265, 0.315, 0.44, 0.49),
      shape: hold(p, 0.455, 0.505, 0.62, 0.67),
      mark: hold(p, 0.635, 0.685, 0.79, 0.84),
      travel: hold(p, 0.805, 0.855, 0.9, 0.94),
      answer: hold(p, 0.912, 0.952, 2, 3),
    },
    sea: {
      rate: 1 - 0.92 * ramp(0.06, 0.3, p) + 0.27 * closing,
      spread: ramp(0.08, 0.32, p) * (1 - 0.45 * closing),
      opacity: 1 - 0.68 * ramp(0.08, 0.34, p) + 0.2 * closing,
    },
    loose: LOOSE_PAGES.map((_, i) => ({
      drop: ramp(0.285 + i * 0.022, 0.335 + i * 0.022, p),
      merge: ramp(0.475 + i * 0.018, 0.525 + i * 0.018, p),
    })),
    page: {
      enter: ramp(0.44, 0.5, p),
      title: ramp(0.49, 0.54, p),
      deck: ramp(0.51, 0.56, p),
      figure: ramp(0.54, 0.59, p),
      body: ramp(0.53, 0.6, p),
      colophon: ramp(0.58, 0.62, p),
      notes: ramp(0.56, 0.62, p) * (1 - ramp(0.8, 0.84, p)),
    },
    signature: ramp(0.665, 0.74, p),
    chop: ramp(0.745, 0.775, p),
    forms: { split: ramp(0.8, 0.87, p), travel: ramp(0.88, 1, p) },
    arrivals: ramp(0.93, 1, p),
  };
}

// ---------- Where things sit on the desk ----------

export type BoardKind = "wide" | "narrow";
export type Placement = { x: number; y: number; w: number; h: number; r: number };

export type Board = {
  width: number;
  height: number;
  /** Where the page sits while it is being set and signed. */
  page: Placement;
  loose: Record<LoosePage, Placement>;
  /** The agent's margin notes, one per gathered fragment. */
  notes: Placement[];
  /** Essay, post, card, once the piece splits into its forms. */
  forms: [Placement, Placement, Placement];
};

export const PAGE_SIZE = { w: 400, h: 540 } as const;
export const POST_SIZE = { w: 260, h: 330 } as const;
export const CARD_SIZE = { w: 290, h: 290 } as const;
/** Must match `.arrival` width in crossing.css. */
export const ARRIVAL_WIDTH = 390;

export const BOARDS: Record<BoardKind, Board> = {
  wide: {
    width: 1200,
    height: 640,
    page: { x: 380, y: 26, w: 440, h: 594, r: 0 },
    loose: {
      voice: { x: 150, y: 60, w: 270, h: 128, r: -6 },
      commit: { x: 640, y: 20, w: 340, h: 74, r: 3 },
      sketch: { x: 250, y: 330, w: 230, h: 180, r: -4 },
      note: { x: 880, y: 150, w: 200, h: 170, r: 7 },
      link: { x: 610, y: 380, w: 260, h: 150, r: -3 },
    },
    notes: [
      { x: 846, y: 160, w: 300, h: 40, r: 0 },
      { x: 846, y: 270, w: 300, h: 40, r: 0 },
      { x: 846, y: 420, w: 300, h: 40, r: 0 },
      { x: 846, y: 500, w: 300, h: 40, r: 0 },
    ],
    forms: [
      { x: 130, y: 90, w: 320, h: 432, r: -7 },
      { x: 480, y: 140, w: 260, h: 330, r: 0 },
      { x: 770, y: 170, w: 290, h: 290, r: 6 },
    ],
  },
  narrow: {
    width: 600,
    height: 900,
    page: { x: 130, y: 150, w: 340, h: 459, r: 0 },
    loose: {
      voice: { x: 16, y: 20, w: 270, h: 128, r: -5 },
      commit: { x: 250, y: 176, w: 340, h: 74, r: 3 },
      sketch: { x: 40, y: 300, w: 230, h: 180, r: -4 },
      note: { x: 330, y: 330, w: 200, h: 170, r: 6 },
      link: { x: 150, y: 560, w: 260, h: 150, r: -3 },
    },
    notes: [
      { x: 90, y: 640, w: 420, h: 36, r: 0 },
      { x: 90, y: 682, w: 420, h: 36, r: 0 },
      { x: 90, y: 724, w: 420, h: 36, r: 0 },
      { x: 90, y: 766, w: 420, h: 36, r: 0 },
    ],
    forms: [
      { x: 40, y: 110, w: 260, h: 351, r: -6 },
      { x: 300, y: 200, w: 250, h: 317, r: 4 },
      { x: 170, y: 540, w: 260, h: 260, r: -2 },
    ],
  },
};

/** Narrow screens get the portrait desk. */
export function boardKindFor(width: number, height: number): BoardKind {
  return width < 760 || width / height < 1.05 ? "narrow" : "wide";
}

/** The desk scales down to fit under the headline, never above its design size. */
export function boardFit(kind: BoardKind, viewportWidth: number, viewportHeight: number): number {
  const board = BOARDS[kind];
  const margin = kind === "wide" ? 48 : 24;
  const share = kind === "wide" ? 0.64 : 0.62;
  return Math.min(1, (viewportWidth - margin) / board.width, (viewportHeight * share) / board.height);
}

// ---------- Poses: where each object is at a given frame ----------

/** Centre, rotation (degrees), scale and opacity, in board coordinates. */
export type Pose = { cx: number; cy: number; r: number; s: number; o: number };

export type Poses = {
  loose: Record<LoosePage, Pose>;
  page: Pose;
  notes: Pose[];
  post: Pose;
  card: Pose;
  labels: Pose[];
  /** Where each form lands in the feed, just under it. */
  arrivals: Pose[];
};

/** Where each fragment goes into the page, as a fraction of the page. */
const GATHER: Record<LoosePage, [number, number]> = {
  voice: [0.5, 0.27],
  commit: [0.5, 0.7],
  sketch: [0.5, 0.45],
  note: [0.45, 0.78],
  link: [0.86, 0.88],
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function centre(p: Placement): [number, number] {
  return [p.x + p.w / 2, p.y + p.h / 2];
}

/**
 * A form leaves the desk for the sea at the edges: smaller, turning in the
 * wind, still visible when the passage ends. `to` is where it drifts, as a
 * fraction of the board from its centre.
 */
function travel(pose: Pose, board: Board, t: number, to: [number, number], turn: number): Pose {
  const eased = t * t * (3 - 2 * t);
  return {
    cx: lerp(pose.cx, board.width * (0.5 + to[0]), eased),
    cy: lerp(pose.cy, board.height * (0.5 + to[1]), eased),
    r: pose.r + turn * t,
    s: pose.s * lerp(1, 0.28, eased),
    o: pose.o * (1 - 0.35 * eased),
  };
}

export function posesAt(frame: PassageFrame, kind: BoardKind): Poses {
  const board = BOARDS[kind];
  const [pageX, pageY] = centre(board.page);
  const pageScale = board.page.w / PAGE_SIZE.w;

  const loose = Object.fromEntries(
    LOOSE_PAGES.map((name, i) => {
      const rest = board.loose[name];
      const { drop, merge } = frame.loose[i];
      const [restX, restY] = centre(rest);
      const [fx, fy] = GATHER[name];
      const gatherX = board.page.x + fx * board.page.w;
      const gatherY = board.page.y + fy * board.page.h;
      const pose: Pose =
        merge > 0
          ? {
              cx: lerp(restX, gatherX, merge),
              cy: lerp(restY, gatherY, merge),
              r: lerp(rest.r, 0, merge),
              s: lerp(1, 0.18, merge),
              o: Math.pow(1 - merge, 1.3),
            }
          : {
              cx: restX,
              cy: lerp(restY - 150, restY, drop),
              r: lerp(rest.r + 12, rest.r, drop),
              s: lerp(1.08, 1, drop),
              o: Math.min(1, drop * 1.8),
            };
      return [name, pose];
    }),
  ) as Record<LoosePage, Pose>;

  const { split, travel: away } = frame.forms;
  const [essay, post, card] = board.forms;
  const [essayX, essayY] = centre(essay);
  const settled: Pose = {
    cx: lerp(pageX, essayX, split),
    cy: lerp(pageY + 70 * (1 - frame.page.enter), essayY, split),
    r: lerp(-2 * (1 - frame.page.enter), essay.r, split),
    s: lerp(pageScale, essay.w / PAGE_SIZE.w, split),
    o: frame.page.enter,
  };

  const [postX, postY] = centre(post);
  const [cardX, cardY] = centre(card);
  const postPose: Pose = {
    cx: lerp(pageX, postX, split),
    cy: lerp(pageY, postY, split),
    r: lerp(0, post.r, split),
    s: lerp(0.7, 1, split) * (post.w / POST_SIZE.w),
    o: Math.min(1, split * 4),
  };
  const cardPose: Pose = {
    cx: lerp(pageX, cardX, split),
    cy: lerp(pageY, cardY, split),
    r: lerp(0, card.r, split),
    s: lerp(0.7, 1, split) * (card.w / CARD_SIZE.w),
    o: Math.min(1, split * 4),
  };

  const travelled = [
    travel(settled, board, away, [-0.4, 0.12], -16),
    travel(postPose, board, away, [0.2, -0.3], 10),
    travel(cardPose, board, away, [0.4, 0.2], 18),
  ];

  return {
    loose,
    page: travelled[0],
    arrivals: travelled.map((form) => ({
      cx: Math.min(board.width - ARRIVAL_WIDTH / 2, Math.max(ARRIVAL_WIDTH / 2, form.cx)),
      cy: form.cy + 74,
      r: 0,
      s: 1,
      o: frame.arrivals,
    })),
    notes: board.notes.map((n, i) => {
      const o = clamp01((frame.page.notes - i * 0.15) / 0.55);
      const [x, y] = centre(n);
      return { cx: x + 14 * (1 - o), cy: y, r: 0, s: 1, o };
    }),
    post: travelled[1],
    card: travelled[2],
    labels: board.forms.map((f) => ({
      cx: f.x + f.w / 2,
      cy: f.y + f.h + 26,
      r: 0,
      s: 1,
      o: split * (1 - ramp(0, 0.25, away)),
    })),
  };
}
