/**
 * The flotilla: the feed as small paper slips riding the swell in toward the
 * visitor. Each slip says what the notice is, with a hand-inked icon for the
 * kind of thing it is, never a platform's logo; the platform, where it helps,
 * is named in words. Pure, so the scatter and the parting are tested.
 */

import { FRAGMENT_POOL } from "../sea";

export const SLIP_ICONS = ["envelope", "calendar", "at", "chat", "heart", "repost", "person", "newsletter", "bell"] as const;
export type SlipIcon = (typeof SLIP_ICONS)[number];
export type SlipFace = { source: string; message: string; icon: SlipIcon };

const BY_MESSAGE: Record<string, SlipIcon> = {
  "a congratulation": "heart",
  "a mention": "at",
  "a quote": "repost",
  "a take": "repost",
  "an intro": "person",
  "a nudge": "bell",
  "an invite": "calendar",
  "a thread": "chat",
  "a reply to a reply": "chat",
  "a message": "chat",
  "a decision": "chat",
};

const BY_SOURCE: Record<string, SlipIcon> = {
  email: "envelope",
  calendar: "calendar",
  newsletter: "newsletter",
  "group chat": "chat",
  x: "at",
  linkedin: "person",
};

/** "email · a reply" → an envelope, from "email", saying "a reply". */
export function slipFor(fragment: string): SlipFace {
  const split = fragment.indexOf(" · ");
  const source = split < 0 ? "" : fragment.slice(0, split);
  const message = split < 0 ? fragment : fragment.slice(split + 3);
  const icon = BY_MESSAGE[message] ?? BY_SOURCE[source.toLowerCase()] ?? "bell";
  return { source: source || "feed", message, icon };
}

export type Slip = {
  /** Where it floats on the open sea, before anything parts it. */
  x: number;
  z: number;
  /** Which fragment it carries: its cell in the atlas. */
  cell: number;
  yaw: number;
  /** Its own rhythm, so no two slips rock together. */
  phase: number;
  scale: number;
  /** How near the visitor it comes before it sinks out of the way. */
  sink: number;
};

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

/** Slips are wider than they are deep, so depth counts for more between them. */
const DEPTH_WEIGHT = 2.2;

/**
 * Scatter slips across the water, no two on top of each other. The sea flows
 * and wraps from near back to far, so spacing is measured around that loop.
 */
export function scatterSlips({ count, seed, xExtent, zNear, zFar }: { count: number; seed: number; xExtent: number; zNear: number; zFar: number }): Slip[] {
  const random = mulberry32(seed);
  const span = zNear - zFar;
  const slips: Slip[] = [];
  const gap = (x: number, z: number) => {
    let nearest = Infinity;
    for (const slip of slips) {
      const dz = Math.abs(slip.z - z);
      nearest = Math.min(nearest, Math.hypot(slip.x - x, Math.min(dz, span - dz) * DEPTH_WEIGHT));
    }
    return nearest;
  };
  for (let i = 0; i < count; i += 1) {
    // Throw darts; keep the first with room around it, else the roomiest.
    let best = { x: 0, z: 0, room: -1 };
    for (let tries = 0; tries < 60 && best.room < 1.9; tries += 1) {
      const x = (random() * 2 - 1) * xExtent;
      const z = zFar + random() * span;
      const room = gap(x, z);
      if (room > best.room) best = { x, z, room };
    }
    // Most slips drift close before they sink; some go under well out.
    const sink = random() < 0.5 ? 0.5 + random() * 3.5 : -16 + random() * 16.5;
    slips.push({
      x: best.x,
      z: best.z,
      cell: Math.floor(random() * FRAGMENT_POOL.length),
      yaw: (random() * 2 - 1) * 0.38,
      phase: random() * Math.PI * 2,
      scale: 0.88 + random() * 0.24,
      sink,
    });
  }
  return slips;
}

/** 1 riding the swell, 0 gone under: a slip sinks as it nears its limit. */
export function afloat(z: number, sink: number): number {
  const t = Math.min(1, Math.max(0, (z - (sink - 1.6)) / 1.6));
  return 1 - t * t * (3 - 2 * t);
}

export type Parting = {
  pointer: { x: number; z: number } | null;
  wake: number;
  spread: number;
  channel: number;
};

/** How far a resting pointer pushes a slip, and how far its push reaches. */
const PUSH = 1.6;
const REACH = 1.6;

/**
 * Where a slip floats once the water parts: out of the middle for the desk,
 * and aside from a resting pointer. Both pushes grow smoothly with nearness
 * and never carry one slip past another.
 */
export function partSlip(x: number, z: number, part: Parting): { x: number; z: number } {
  let px = x;
  let pz = z;
  if (part.spread > 0) {
    px += (x < 0 ? -1 : 1) * Math.min(1, part.spread) * (part.channel + 0.7) * Math.exp(-Math.abs(x) / 9);
  }
  if (part.pointer && part.wake > 0) {
    const dx = px - part.pointer.x;
    const dz = pz - part.pointer.z;
    const d = Math.hypot(dx, dz);
    const push = Math.min(1, part.wake) * PUSH * Math.exp(-(d * d) / (REACH * REACH));
    if (d > 1e-9) {
      px += (dx / d) * push;
      pz += (dz / d) * push;
    } else {
      px += push;
    }
  }
  return { x: px, z: pz };
}
