/**
 * Where the camera is and what the world does at each point of the passage.
 * It opens low over the sea of feeds, looking out to the horizon; tilts down
 * as the sea parts to reveal the desk; leans in to watch the crew make the
 * piece, then looks straight down again for your signature; and lifts back
 * toward the horizon as the pieces go out. Pure, so the
 * whole path is tested without a GPU.
 */

import { BOARDS, LOOSE_PAGES, type BoardKind, type LoosePage } from "../passage";

export type Vec3 = [number, number, number];
export type Shot = { position: Vec3; look: Vec3; fov: number };

const FOV = 35;
/** Board pixels to world units: the desk is laid out like the flat version. */
export const PX = 0.01;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function ramp(from: number, to: number, p: number): number {
  const t = clamp01((p - from) / (to - from));
  return t * t * (3 - 2 * t);
}

function mixVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function mixShot(a: Shot, b: Shot, t: number): Shot {
  return { position: mixVec(a.position, b.position, t), look: mixVec(a.look, b.look, t), fov: a.fov + (b.fov - a.fov) * t };
}

/** Low over the sea, looking a touch up: the horizon sits below the headline. */
const HORIZON: Shot = { position: [0, 1.25, 7.5], look: [0, 1.45, -40], fov: FOV };
/** Lifted a little, still looking out: the pieces sail toward it. */
const FAREWELL: Shot = { position: [0, 3.4, 9], look: [0, 0.4, -34], fov: FOV };

export function boardKindForAspect(aspect: number): BoardKind {
  return aspect < 1.05 ? "narrow" : "wide";
}

/** How far the camera leans in, off straight down, to watch the crew at work. */
const LEAN = (26 * Math.PI) / 180;

/**
 * Down over the desk, which fills the space below the headline. Leaning in
 * swings the camera toward the visitor about the point it looks at, pulled
 * back a touch so the near edge of the desk stays in frame.
 */
function deskShot(aspect: number, kind: BoardKind, lean = 0): Shot {
  const board = BOARDS[kind];
  const half = Math.tan((FOV * Math.PI) / 360);
  const width = board.width * PX;
  const depth = board.height * PX;
  const visible = Math.max(depth / 0.62, width / (0.92 * aspect));
  const height = visible / (2 * half);
  // The desk's middle sits 15% of the view below the centre of the screen.
  const lookZ = -0.15 * visible;
  const reach = height * (1 + 0.1 * Math.sin(lean));
  return { position: [0, reach * Math.cos(lean), lookZ + reach * Math.sin(lean)], look: [0, 0, lookZ], fov: FOV };
}

export function shotAt(progress: number, aspect: number, kind: BoardKind = boardKindForAspect(aspect)): Shot {
  const p = clamp01(progress);
  // Straight down while the pages land, leaning in while the crew works, and back for your signature.
  const lean = LEAN * (ramp(0.44, 0.5, p) - ramp(0.62, 0.67, p));
  const down = mixShot(HORIZON, deskShot(aspect, kind, lean), ramp(0.07, 0.3, p));
  return mixShot(down, FAREWELL, ramp(0.8, 1, p));
}

/** The camera's frame: straight down, screen up is toward the horizon. */
export function viewOf(shot: Shot): { position: Vec3; direction: Vec3; up: Vec3 } {
  const [px, py, pz] = shot.position;
  const d: Vec3 = [shot.look[0] - px, shot.look[1] - py, shot.look[2] - pz];
  const n = Math.hypot(d[0], d[1], d[2]) || 1;
  const direction: Vec3 = [d[0] / n, d[1] / n, d[2] / n];
  const toward = ramp(0.85, 0.999, -direction[1]);
  const ref: Vec3 = [0, 1 - toward, -toward];
  const along = ref[0] * direction[0] + ref[1] * direction[1] + ref[2] * direction[2];
  const u: Vec3 = [ref[0] - direction[0] * along, ref[1] - direction[1] * along, ref[2] - direction[2] * along];
  const m = Math.hypot(u[0], u[1], u[2]) || 1;
  return { position: shot.position, direction, up: [u[0] / m, u[1] / m, u[2] / m] };
}

export function seaAt(progress: number): { spread: number; rate: number } {
  const p = clamp01(progress);
  const closing = ramp(0.86, 1, p);
  return {
    spread: ramp(0.08, 0.32, p) * (1 - 0.55 * closing),
    rate: 1 - 0.92 * ramp(0.06, 0.3, p) + 0.3 * closing,
  };
}

/** 1 while the camera looks out at the crowd of words; 0 once they lie flat over the desk. */
export function standAt(progress: number): number {
  const p = clamp01(progress);
  return 1 - ramp(0.07, 0.26, p) + ramp(0.82, 0.98, p);
}

/** Each loose page drops when its moment in the story arrives. */
export function droppedAt(progress: number): boolean[] {
  return LOOSE_PAGES.map((_, i) => progress >= 0.285 + i * 0.022);
}

export type DeskPlace = { x: number; z: number; w: number; h: number; yaw: number };

/** Where each loose page rests on the desk, in world units. */
export function deskPlacements(kind: BoardKind): Record<LoosePage, DeskPlace> {
  const board = BOARDS[kind];
  return Object.fromEntries(
    LOOSE_PAGES.map((name) => {
      const rest = board.loose[name];
      return [
        name,
        {
          x: (rest.x + rest.w / 2 - board.width / 2) * PX,
          z: (rest.y + rest.h / 2 - board.height / 2) * PX,
          w: rest.w * PX,
          h: rest.h * PX,
          yaw: (-rest.r * Math.PI) / 180,
        },
      ];
    }),
  ) as Record<LoosePage, DeskPlace>;
}
