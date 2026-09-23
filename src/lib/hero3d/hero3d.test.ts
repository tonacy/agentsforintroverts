import { describe, expect, it } from "vitest";

import { stepSpring } from "./springs";
import { FALL_SECONDS, SETTLE_SECONDS, advanceClock, fallPose } from "./fall";
import { deskPlacements, droppedAt, seaAt, shotAt, standAt, viewOf, type Vec3 } from "./director";
import { LOOSE_PAGES } from "../passage";
import { FRAGMENT_POOL } from "../sea";
import { SLIP_ICONS, afloat, partSlip, scatterSlips, slipFor } from "./slips";
import { SWELL_GLSL, WAVES, calmAt, swellAt } from "./swell";
import { printPlacement } from "./crew";

const samples = Array.from({ length: 401 }, (_, i) => i / 400);

describe("stepSpring", () => {
  it("settles on its target without overshooting from rest", () => {
    let s = { value: 0, velocity: 0 };
    let peak = 0;
    for (let i = 0; i < 240; i += 1) {
      s = stepSpring(s, 1, 1 / 60, 0.12);
      peak = Math.max(peak, s.value);
    }
    expect(s.value).toBeCloseTo(1, 4);
    expect(peak).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("moves the same whatever the frame rate", () => {
    let fast = { value: 0, velocity: 0 };
    let slow = { value: 0, velocity: 0 };
    for (let i = 0; i < 12; i += 1) fast = stepSpring(fast, 1, 1 / 120, 0.2);
    for (let i = 0; i < 6; i += 1) slow = stepSpring(slow, 1, 1 / 60, 0.2);
    expect(fast.value).toBeCloseTo(slow.value, 6);
  });
});

describe("fallPose: a page dropped onto the desk", () => {
  it("starts above the desk and unseen, and ends flat on it", () => {
    const start = fallPose(0, 0.3, 7);
    expect(start.y).toBeCloseTo(7);
    expect(start.opacity).toBe(0);
    const rest = fallPose(FALL_SECONDS + SETTLE_SECONDS, 0.3, 7);
    expect(rest.y).toBe(0);
    expect(rest.opacity).toBe(1);
    expect(Math.abs(rest.pitch) + Math.abs(rest.roll) + Math.abs(rest.bend)).toBeLessThan(1e-3);
    expect(rest.x).toBeCloseTo(0);
    expect(rest.z).toBeCloseTo(0);
  });

  it("only ever descends, sways within reason, and throws a shadow as it nears the desk", () => {
    let last = Infinity;
    for (let t = 0; t <= FALL_SECONDS; t += 0.01) {
      const pose = fallPose(t, 0.7, 7);
      expect(pose.y).toBeLessThanOrEqual(last + 1e-9);
      expect(Math.abs(pose.x)).toBeLessThan(1.2);
      expect(Math.abs(pose.roll)).toBeLessThan(0.8);
      last = pose.y;
    }
    expect(fallPose(FALL_SECONDS * 0.95, 0.7, 7).shadow).toBeGreaterThan(fallPose(FALL_SECONDS * 0.2, 0.7, 7).shadow);
  });

  it("falls in real time when dropped, and rises again when the visitor scrolls back", () => {
    let clock = 0;
    for (let i = 0; i < 30; i += 1) clock = advanceClock(clock, true, 1 / 60);
    expect(clock).toBeCloseTo(0.5, 5);
    for (let i = 0; i < 600; i += 1) clock = advanceClock(clock, true, 1 / 60);
    expect(clock).toBe(FALL_SECONDS + SETTLE_SECONDS);
    for (let i = 0; i < 600; i += 1) clock = advanceClock(clock, false, 1 / 60);
    expect(clock).toBe(0);
  });
});

function length(v: Vec3) {
  return Math.hypot(v[0], v[1], v[2]);
}

function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

describe("the camera: from the horizon down to the desk", () => {
  it("opens looking out across the sea toward the horizon", () => {
    const { direction } = viewOf(shotAt(0, 1.6));
    expect(Math.abs(direction[1])).toBeLessThan(0.1);
    expect(direction[2]).toBeLessThan(-0.9);
  });

  it("looks straight down while the pages land and while you sign", () => {
    for (const p of [0.35, 0.72]) {
      const { direction } = viewOf(shotAt(p, 1.6));
      expect(direction[1]).toBeLessThan(-0.999);
    }
  });

  it("leans in to watch the crew at work", () => {
    for (const p of [0.5, 0.56]) {
      const { direction } = viewOf(shotAt(p, 1.6));
      const lean = (Math.acos(-direction[1]) * 180) / Math.PI;
      expect(lean).toBeGreaterThan(15);
      expect(lean).toBeLessThan(35);
    }
  });

  it("never jumps between frames", () => {
    let previous = viewOf(shotAt(0, 1.6));
    for (const p of samples.slice(1)) {
      const next = viewOf(shotAt(p, 1.6));
      const turn = Math.acos(Math.min(1, previous.direction.reduce((sum, v, i) => sum + v * next.direction[i], 0)));
      const moved = length([next.position[0] - previous.position[0], next.position[1] - previous.position[1], next.position[2] - previous.position[2]]);
      expect(turn).toBeLessThan(0.05);
      expect(moved).toBeLessThan(0.6);
      previous = next;
    }
  });

  it.each([
    ["wide", 1.6, 0.35],
    ["wide", 1.6, 0.53],
    ["wide", 1.6, 0.72],
    ["narrow", 390 / 844, 0.35],
    ["narrow", 390 / 844, 0.53],
    ["narrow", 390 / 844, 0.72],
  ] as const)("frames the whole %s desk below the headline (at %s of the passage)", (kind, aspect, p) => {
    const shot = shotAt(p, aspect);
    const { position, direction, up } = viewOf(shot);
    const right = cross(direction, up);
    const half = Math.tan((shot.fov * Math.PI) / 360);
    const print = printPlacement(kind);
    for (const place of [...Object.values(deskPlacements(kind)), { ...print, yaw: 0 }]) {
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const offset: Vec3 = [place.x + (dx * place.w) / 2 - position[0], -position[1], place.z + (dz * place.h) / 2 - position[2]];
        const depth = dot(offset, direction);
        // Screen right is +sx; screen down is +sy.
        const sx = dot(offset, right) / (depth * half * aspect);
        const sy = -dot(offset, up) / (depth * half);
        expect(Math.abs(sx)).toBeLessThan(1);
        expect(sy).toBeGreaterThan(-0.4);
        expect(sy).toBeLessThan(1);
      }
    }
  });
});

describe("the sea and the drops", () => {
  it("parts the sea for the desk and opens it again at the end", () => {
    expect(seaAt(0).spread).toBe(0);
    expect(seaAt(0.5).spread).toBe(1);
    expect(seaAt(1).spread).toBeLessThan(1);
    for (const p of samples) expect(seaAt(p).rate).toBeGreaterThan(0);
  });

  it("drops the loose pages one after another, and only once the desk is in view", () => {
    expect(droppedAt(0.2).some(Boolean)).toBe(false);
    expect(droppedAt(0.45).every(Boolean)).toBe(true);
    const firsts = LOOSE_PAGES.map((_, i) => samples.find((p) => droppedAt(p)[i])!);
    expect([...firsts].sort((a, b) => a - b)).toEqual(firsts);
    expect(viewOf(shotAt(firsts[0], 1.6)).direction[1]).toBeLessThan(-0.99);
  });
});

describe("the crowd of words", () => {
  it("stands facing the visitor at the horizon and lies down flat over the desk", () => {
    expect(standAt(0)).toBe(1);
    expect(standAt(0.5)).toBe(0);
    expect(standAt(1)).toBe(1);
    const firstDrop = samples.find((p) => droppedAt(p)[0])!;
    expect(standAt(firstDrop)).toBe(0);
  });
});

describe("the flotilla's slips", () => {
  it("gives every feed fragment a generic icon, a source and a message", () => {
    for (const fragment of FRAGMENT_POOL) {
      const slip = slipFor(fragment);
      expect(SLIP_ICONS).toContain(slip.icon);
      expect(slip.source.length).toBeGreaterThan(0);
      expect(slip.message.length).toBeGreaterThan(0);
      expect(`${slip.source.toLowerCase()} · ${slip.message}`).toBe(fragment.toLowerCase());
    }
  });

  it("never draws a platform's logo, only what the notification is", () => {
    expect(SLIP_ICONS.some((icon) => /linkedin|twitter|^x$|slack|gmail/i.test(icon))).toBe(false);
    expect(slipFor("email · a reply").icon).toBe("envelope");
    expect(slipFor("calendar · an ask").icon).toBe("calendar");
    expect(slipFor("X · a mention").icon).toBe("at");
    expect(slipFor("LinkedIn · a congratulation").icon).toBe("heart");
    expect(slipFor("group chat · a decision").icon).toBe("chat");
  });
});

describe("the swell", () => {
  const grid: [number, number][] = [];
  for (let x = -20; x <= 20; x += 1.7) for (let z = -50; z <= 8; z += 1.3) grid.push([x, z]);

  it("stays a gentle swell, never a storm", () => {
    for (const t of [0, 3.1, 47]) {
      for (const [x, z] of grid) expect(Math.abs(swellAt(x, z, t).height)).toBeLessThan(0.45);
    }
  });

  it("reports slopes that match its heights, so light and tilt follow the water", () => {
    const e = 1e-4;
    for (const [x, z] of grid.slice(0, 60)) {
      const s = swellAt(x, z, 2.3);
      expect(s.dx).toBeCloseTo((swellAt(x + e, z, 2.3).height - swellAt(x - e, z, 2.3).height) / (2 * e), 4);
      expect(s.dz).toBeCloseTo((swellAt(x, z + e, 2.3).height - swellAt(x, z - e, 2.3).height) / (2 * e), 4);
    }
  });

  it("rolls toward the visitor, slowly", () => {
    // A wave travelling toward +z rises where its slope faces away: dh/dt and dh/dz disagree.
    let travel = 0;
    let fastest = 0;
    const dt = 1 / 60;
    for (const [x, z] of grid) {
      const now = swellAt(x, z, 5);
      const next = swellAt(x, z, 5 + dt);
      const rate = (next.height - now.height) / dt;
      travel += rate * now.dz;
      fastest = Math.max(fastest, Math.abs(rate));
    }
    expect(travel).toBeLessThan(0);
    expect(fastest).toBeLessThan(0.4);
  });

  it("is written into the shaders from the same waves", () => {
    expect(SWELL_GLSL.match(/swellWave\(/g)?.length).toBe(WAVES.length + 1);
  });
});

describe("the calm", () => {
  const still = { pointer: null, wake: 0, spread: 0, channel: 6.7 };

  it("leaves the open sea alone", () => {
    expect(calmAt(0, -10, still)).toBe(1);
    expect(calmAt(12, 3, still)).toBe(1);
  });

  it("flattens the water under a resting pointer, and only near it", () => {
    const resting = { ...still, pointer: { x: 2, z: -4 }, wake: 1 };
    expect(calmAt(2, -4, resting)).toBeLessThan(0.05);
    expect(calmAt(9, -4, resting)).toBeGreaterThan(0.98);
  });

  it("opens still water down the middle for the desk", () => {
    const open = { ...still, spread: 1 };
    for (const z of [-30, -5, 0, 6]) {
      expect(calmAt(0, z, open)).toBeLessThan(0.02);
      expect(calmAt(5.5, z, open)).toBeLessThan(0.1);
      expect(calmAt(11, z, open)).toBeGreaterThan(0.97);
    }
  });

  it("never amplifies the swell", () => {
    for (const x of [-9, -3, 0, 4, 8]) {
      for (const spread of [0, 0.4, 1]) {
        const c = calmAt(x, -2, { pointer: { x: 1, z: -2 }, wake: 0.6, spread, channel: 6.7 });
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("the flotilla", () => {
  const field = { count: 700, seed: 11, xExtent: 32, zNear: 8, zFar: -66 };
  const slips = scatterSlips(field);

  it("is the same flotilla every visit", () => {
    expect(scatterSlips(field)).toEqual(slips);
    expect(slips).toHaveLength(700);
  });

  it("floats every kind of notice, scattered rather than in lanes", () => {
    expect(new Set(slips.map((slip) => slip.cell)).size).toBe(FRAGMENT_POOL.length);
    for (const slip of slips) {
      expect(Math.abs(slip.x)).toBeLessThanOrEqual(field.xExtent);
      expect(slip.z).toBeGreaterThanOrEqual(field.zFar);
      expect(slip.z).toBeLessThanOrEqual(field.zNear);
    }
    // Lanes would put hundreds of slips on a few dozen lines; scattered, they rarely share one.
    const columns = new Set(slips.map((slip) => Math.round(slip.x * 10)));
    expect(columns.size).toBeGreaterThan(slips.length / 2);
  });

  it("never stacks two slips on top of each other", () => {
    let closest = Infinity;
    for (let i = 0; i < slips.length; i += 1) {
      for (let j = i + 1; j < slips.length; j += 1) {
        // Slips are wider than they are deep, so depth counts for more.
        closest = Math.min(closest, Math.hypot(slips[i].x - slips[j].x, (slips[i].z - slips[j].z) * 2.2));
      }
    }
    expect(closest).toBeGreaterThan(1);
  });

  it("is thick toward the horizon and sparse near the visitor", () => {
    const density = (from: number, to: number) => {
      let total = 0;
      for (const slip of slips) for (let z = from; z < to; z += 0.5) total += afloat(z, slip.sink);
      return total / (to - from);
    };
    expect(density(-40, -20)).toBeGreaterThan(density(0, 6) * 2);
    expect(density(0, 6)).toBeGreaterThan(0);
    for (const slip of slips) expect(afloat(7.5, slip.sink)).toBe(0);
  });

  it("drifts out of the middle to open the still water", () => {
    const open = { pointer: null, wake: 0, spread: 1, channel: 6.7 };
    for (let x = -30; x <= 30; x += 0.25) {
      expect(Math.abs(partSlip(x, 0, open).x)).toBeGreaterThan(6.7);
    }
    const closed = partSlip(3, -4, { ...open, spread: 0 });
    expect(closed).toEqual({ x: 3, z: -4 });
  });

  it("makes way for a resting pointer, without ever jumping", () => {
    const part = { pointer: { x: 1, z: -5 }, wake: 1, spread: 0, channel: 6.7 };
    for (let x = -4; x <= 6; x += 0.2) {
      for (let z = -10; z <= 0; z += 0.2) {
        const moved = partSlip(x, z, part);
        expect(Math.hypot(moved.x - 1, moved.z + 5)).toBeGreaterThan(1.2);
        // Only a slip dead under the pointer has to pick a side to go.
        if (Math.hypot(x - 1, z + 5) < 0.4) continue;
        const nudged = partSlip(x, z, { ...part, pointer: { x: 1.01, z: -5 } });
        expect(Math.hypot(nudged.x - moved.x, nudged.z - moved.z)).toBeLessThan(0.05);
      }
    }
  });
});
