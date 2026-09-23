/**
 * The crew: little flying robots, your agents, who arrive once your pages
 * have landed, lift each one, and press it into its section of the piece,
 * one after another. Each section inks in where its page went down, and its
 * robot flies off, so the finished piece is left for you to sign.
 *
 * Pure: the whole routine is a function of the crew's clock, so it plays the
 * same forward and back, and it is tested without a GPU.
 */

import { BOARDS, LOOSE_PAGES, type BoardKind, type LoosePage } from "../passage";
import { PX, deskPlacements, type DeskPlace } from "./director";

/** When the crew works, as progress through the passage: from "They do the publishing work." until the piece is yours to sign. */
export const ASSEMBLY = [0.47, 0.62] as const;

/** The piece, top to bottom: the title from your voice note, the figure from your sketch, two paragraphs, the kept source. */
export const READING_ORDER: readonly LoosePage[] = ["voice", "sketch", "commit", "note", "link"];

/** Each page's section of the piece, as fractions of the sheet: left, top, right, bottom. */
export const SECTIONS: Record<LoosePage, [number, number, number, number]> = {
  voice: [0.075, 0.085, 0.925, 0.3],
  sketch: [0.075, 0.315, 0.925, 0.675],
  commit: [0.075, 0.69, 0.925, 0.772],
  note: [0.075, 0.776, 0.925, 0.862],
  link: [0.075, 0.866, 0.925, 0.9],
};

type Vec3 = [number, number, number];
export type PrintPlace = { x: number; z: number; w: number; h: number };

/** The piece sits where the flat desk sets it. */
export function printPlacement(kind: BoardKind): PrintPlace {
  const board = BOARDS[kind];
  const page = board.page;
  return {
    x: (page.x + page.w / 2 - board.width / 2) * PX,
    z: (page.y + page.h / 2 - board.height / 2) * PX,
    w: page.w * PX,
    h: page.h * PX,
  };
}

/** Where a page is pressed into the piece: the middle of its section. */
export function slotFor(print: PrintPlace, page: LoosePage): { x: number; z: number } {
  const [left, top, right, bottom] = SECTIONS[page];
  return { x: print.x + ((left + right) / 2 - 0.5) * print.w, z: print.z + ((top + bottom) / 2 - 0.5) * print.h };
}

/** How high a loose page rests on the desk; each lies a hair above the one before. */
export function restHeight(page: LoosePage): number {
  return 0.012 + LOOSE_PAGES.indexOf(page) * 0.002;
}

/** The piece lies under the loose pages; a page pressed into it lies just above. */
export const PRINT_HEIGHT = 0.006;
const PRESSED = 0.022;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function ease(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

/**
 * A task that plays in real time once its moment in the passage comes, but
 * never falls behind the scroll: by the end of its window it is done. Before
 * its window it rewinds, so scrolling back undoes it.
 */
export function advanceTask(clock: number, dt: number, progress: number, window: readonly [number, number], duration: number): number {
  const [start, done] = window;
  if (progress < start) return Math.max(0, clock - dt * 1.6);
  const floor = clamp01((progress - start) / (done - start)) * duration;
  return Math.min(duration, Math.max(floor, clock + dt));
}

// ---------- The plan ----------

/** A robot's middle hangs this far above the page it holds. */
const HANG = 0.36;
/** Cruising, in world units a second on average; the ease makes the peak half as fast again. */
const SPEED = 4;
/** Climbing and settling are slower and more careful, especially with a page. */
const CLIMB = 3;
const GRIP = 0.2;
const LET_GO = 0.25;
/** A pressed page melts into the piece while its section inks in. */
const MERGE = 0.75;
const INK = 0.95;
/** The quickest one section follows another. */
const CADENCE = 0.5;
/** The piece surfaces first, before the first page is pressed into it. */
const SURFACE = 0.7;
/**
 * Robots carry in two lanes, alternately, far enough apart that a page in the
 * upper lane clears a robot in the lower one.
 */
const LANES = [1.2, 1.95];
/** Having let go, a robot slides out low, under any page coming in above it. */
const SLIDE = 0.45;
/** How close robots may come to each other, and a page to a robot it isn't held by. */
const ROOM = 0.76;
const HEADROOM = 0.37;

type Leg = { t0: number; t1: number; from: Vec3; to: Vec3 };

export type BotPlan = {
  page: LoosePage;
  legs: Leg[];
  start: number;
  /** When the robot has hold of the page, when it lets go, and when it is gone. */
  grab: number;
  release: number;
  end: number;
  rest: DeskPlace & { y: number };
  slot: { x: number; z: number };
  lane: number;
};

export type Crew = { bots: BotPlan[]; print: PrintPlace; duration: number };

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

function flight(a: Vec3, b: Vec3): number {
  return Math.max(0.5, distance(a, b) / SPEED);
}

function climb(a: Vec3, b: Vec3, least: number): number {
  return Math.max(least, distance(a, b) / CLIMB);
}

/** One robot's routine, timed so that it lets go of its page at `release`. */
function routine(
  page: LoosePage,
  rest: DeskPlace & { y: number },
  slot: { x: number; z: number },
  lane: number,
  print: PrintPlace,
  reach: number,
  release: number,
): BotPlan {
  const side = rest.x < print.x ? -1 : 1;
  const entry: Vec3 = [side * (reach + 1.2), lane + 0.35, rest.z * 0.85];
  const over: Vec3 = [rest.x, lane, rest.z];
  const low: Vec3 = [rest.x, rest.y + HANG, rest.z];
  const above: Vec3 = [slot.x, lane, slot.z];
  const down: Vec3 = [slot.x, PRESSED + HANG, slot.z];
  const out: Vec3 = [slot.x + side * (print.w / 2 + 0.55), SLIDE, slot.z];
  const up: Vec3 = [out[0], lane + 0.35, slot.z];
  const exit: Vec3 = [side * (reach + 1.4), lane + 0.7, slot.z];
  const steps: [Vec3, Vec3, number][] = [
    [entry, over, flight(entry, over)],
    [over, low, climb(over, low, 0.4)],
    [low, low, GRIP],
    [low, over, climb(low, over, 0.45)],
    [over, above, flight(over, above)],
    [above, down, climb(above, down, 0.4)],
    [down, down, LET_GO],
    [down, out, climb(down, out, 0.45)],
    [out, up, climb(out, up, 0.4)],
    [up, exit, flight(up, exit)],
  ];
  const beforeRelease = steps.slice(0, 7).reduce((sum, step) => sum + step[2], 0);
  const legs: Leg[] = [];
  let t = release - beforeRelease;
  for (const [from, to, seconds] of steps) {
    legs.push({ t0: t, t1: t + seconds, from, to });
    t += seconds;
  }
  return { page, legs, start: legs[0].t0, grab: legs[3].t0, release, end: t, rest, slot, lane };
}

/** Whether two robots, as planned, ever come too close, or one's page too close to the other. */
function clash(a: BotPlan, b: BotPlan): boolean {
  const from = Math.max(a.start, b.start);
  const to = Math.min(a.end, b.end);
  for (let t = from; t <= to; t += 1 / 60) {
    const pa = positionAt(a, t);
    const pb = positionAt(b, t);
    if (distance(pa, pb) < ROOM) return true;
    for (const [holder, other, at] of [[a, pb, pa], [b, pa, pb]] as const) {
      if (t < holder.grab || t >= holder.release) continue;
      const yaw = pageYaw(holder, t);
      const dx = other[0] - at[0];
      const dz = other[2] - at[2];
      const along = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      const across = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      const over = Math.abs(along) < holder.rest.w / 2 + 0.4 && Math.abs(across) < holder.rest.h / 2 + 0.4;
      if (over && Math.abs(other[1] - Math.max(holder.rest.y, at[1] - HANG)) < HEADROOM) return true;
    }
  }
  return false;
}

/**
 * Plan the crew for a desk. `reach` is how far out from the middle the camera
 * sees at desk height; the robots come in from just beyond it, and go back
 * out the same way.
 *
 * Pages go in one after another, never closer than CADENCE, each as soon as
 * its robot can fly the whole routine without meeting another robot or
 * another robot's page. Whichever page can go in soonest goes next, reading
 * order breaking ties, so a page lying where the piece surfaces is cleared
 * first rather than waited around.
 */
export function planCrew(kind: BoardKind, reach = (BOARDS[kind].width * PX) / 2 + 3): Crew {
  const key = `${kind}:${reach.toFixed(2)}`;
  const known = plans.get(key);
  if (known) return known;
  const print = printPlacement(kind);
  const places = deskPlacements(kind);
  const bots: BotPlan[] = [];
  let next = SURFACE + 0.9;
  const waiting = [...READING_ORDER];
  while (waiting.length > 0) {
    const lane = LANES[bots.length % LANES.length];
    let best: BotPlan | null = null;
    for (const page of waiting) {
      const rest = { ...places[page], y: restHeight(page) };
      const slot = slotFor(print, page);
      let release = next;
      let bot = routine(page, rest, slot, lane, print, reach, release);
      while (bots.some((other) => clash(other, bot)) && (!best || release < best.release)) {
        release += 0.05;
        bot = routine(page, rest, slot, lane, print, reach, release);
      }
      if (!best || release < best.release - 1e-9) best = bot;
    }
    bots.push(best!);
    waiting.splice(waiting.indexOf(best!.page), 1);
    next = best!.release + CADENCE;
  }

  // Start the clock at the earliest robot.
  const shift = Math.min(...bots.map((b) => b.start));
  for (const bot of bots) {
    bot.start -= shift;
    bot.grab -= shift;
    bot.release -= shift;
    bot.end -= shift;
    for (const l of bot.legs) {
      l.t0 -= shift;
      l.t1 -= shift;
    }
  }
  const duration = Math.max(...bots.map((b) => Math.max(b.end, b.release - LET_GO + INK, b.release + MERGE)));
  const crew = { bots, print, duration };
  plans.set(key, crew);
  return crew;
}

const plans = new Map<string, Crew>();

// ---------- The routine at a moment ----------

export type Mood = "look" | "blink" | "work" | "happy";

export type BotPose = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Nose down into its flight; banked into its turns. */
  pitch: number;
  roll: number;
  /** 0 arms tucked, 1 holding a page. */
  grip: number;
  mood: Mood;
  visible: boolean;
};

export type HeldPage = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  /** Held from the middle, a sheet droops at its ends. */
  bend: number;
  scale: number;
  opacity: number;
  /** Off the desk, in a robot's hands. */
  lifted: boolean;
};

export type CrewFrame = {
  bots: BotPose[];
  /** A page in the crew's care, or null while it still lies where it landed. */
  pages: Record<LoosePage, HeldPage | null>;
  /** How far each page's section of the piece has inked in. */
  sections: Record<LoosePage, number>;
  /** How far the piece has surfaced. */
  print: number;
};

function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function positionAt(bot: BotPlan, t: number): Vec3 {
  const legs = bot.legs;
  if (t <= legs[0].t0) return legs[0].from;
  for (const l of legs) if (t < l.t1) return mix(l.from, l.to, ease((t - l.t0) / (l.t1 - l.t0)));
  return legs[legs.length - 1].to;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** A carried page turns from how it lay to square with the piece as it is flown in. */
function pageYaw(bot: BotPlan, t: number): number {
  const carry = bot.legs[4];
  return bot.rest.yaw * (1 - ease((t - carry.t0) / (carry.t1 - carry.t0)));
}

/** The crew at a moment of its routine; `time` keeps idle motion alive while the routine holds still. */
export function crewAt(crew: Crew, clock: number, time: number): CrewFrame {
  const pages = {} as Record<LoosePage, HeldPage | null>;
  const sections = {} as Record<LoosePage, number>;
  const bots = crew.bots.map((bot, k): BotPose => {
    const h = 1 / 30;
    const here = positionAt(bot, clock);
    const before = positionAt(bot, clock - h);
    const after = positionAt(bot, clock + h);
    const velocity = sub(after, before).map((v) => v / (2 * h));
    const accel = sub(sub(after, here), sub(here, before)).map((v) => v / (h * h));
    // Like a drone it flies any way while keeping its face on you, turning a little into its flight.
    const yaw = 0.45 * Math.tanh(velocity[0] / 2.5) + 0.07 * Math.sin(time * 0.9 + k * 2.1);
    const pitch = Math.max(-0.3, Math.min(0.3, 0.05 * velocity[2] + 0.03 * accel[2]));
    const roll = Math.max(-0.3, Math.min(0.3, -0.05 * velocity[0] - 0.03 * accel[0]));

    const grip = clamp01((clock - (bot.grab - GRIP)) / GRIP) * (1 - clamp01((clock - (bot.release - LET_GO)) / LET_GO));
    const carrying = clock >= bot.grab && clock < bot.release;
    const happy = clock >= bot.release && clock < bot.release + 1.4;
    const blink = (time * 0.31 + k * 0.23) % 1 < 0.035;
    const mood: Mood = happy ? "happy" : carrying ? "work" : blink ? "blink" : "look";

    // The page: untouched until the robot has hold of it; then carried; then pressed in.
    const rest = bot.rest;
    if (clock < bot.grab - GRIP) {
      pages[bot.page] = null;
    } else if (clock < bot.release) {
      const aloft = clamp01((here[1] - HANG - rest.y) / 0.3);
      pages[bot.page] = {
        x: here[0],
        y: Math.max(rest.y, here[1] - HANG),
        z: here[2],
        yaw: pageYaw(bot, clock),
        pitch: pitch * 0.5 * aloft,
        roll: roll * 0.5 * aloft,
        bend: -0.3 * aloft,
        scale: 1,
        opacity: 1,
        lifted: clock >= bot.grab,
      };
    } else {
      const merge = clamp01((clock - bot.release) / MERGE);
      pages[bot.page] = {
        x: bot.slot.x,
        y: PRESSED,
        z: bot.slot.z,
        yaw: 0,
        pitch: 0,
        roll: 0,
        bend: 0,
        scale: 1 - 0.82 * ease(merge),
        opacity: Math.pow(1 - merge, 1.3),
        lifted: false,
      };
    }
    sections[bot.page] = ease((clock - (bot.release - LET_GO)) / INK);

    // A hovering robot bobs; one at work holds steady.
    const bob = carrying ? 0 : 0.035 * Math.sin(time * 2.3 + k * 1.7) * clamp01(clock - bot.start) * clamp01(bot.end - clock);
    return {
      x: here[0],
      y: here[1] + bob,
      z: here[2],
      yaw,
      pitch,
      roll,
      grip,
      mood,
      visible: clock > bot.start && clock < bot.end,
    };
  });
  return { bots, pages, sections, print: ease(clock / SURFACE) };
}
