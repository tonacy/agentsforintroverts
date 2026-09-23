/**
 * The water under the feed: a slow swell rolling in toward the visitor. The
 * shaders draw it as ink lines and float the slips on it; the same waves are
 * summed here, so what the tests hold to account is what the visitor sees.
 *
 * Each wave is an exponentiated sine, which gives the peaked crests and broad
 * troughs of real swell, with analytic slopes for the light and the tilt.
 */

type WaveShape = {
  /** Degrees off rolling straight toward the visitor. */
  angle: number;
  length: number;
  amp: number;
  phase: number;
};

// Crossing seas: waves at wide angles to each other make short crests, so
// each carved line ripples along its length the way water does in a print.
const SHAPES: readonly WaveShape[] = [
  { angle: 12, length: 10, amp: 0.16, phase: 0 },
  { angle: -38, length: 5.2, amp: 0.1, phase: 1.7 },
  { angle: 44, length: 3.6, amp: 0.07, phase: 4.1 },
  { angle: -62, length: 2.3, amp: 0.045, phase: 2.3 },
  { angle: 25, length: 1.5, amp: 0.022, phase: 5.2 },
  { angle: -75, length: 1, amp: 0.012, phase: 0.9 },
];

/** Slower than real water: a swell to watch, not to be tossed by. */
const PACE = 0.35;
/** The mean of e^(sin θ − 1) over a cycle, I0(1)/e, so the swell rests at sea level. */
const MEAN = 0.4657596;
/** How far a resting pointer stills the water. */
const POOL = 2.2;

export const WAVES = SHAPES.map((shape) => {
  const k = (2 * Math.PI) / shape.length;
  const angle = (shape.angle * Math.PI) / 180;
  return {
    kx: k * Math.sin(angle),
    kz: k * Math.cos(angle),
    omega: PACE * Math.sqrt(9.81 * k),
    amp: shape.amp,
    phase: shape.phase,
  };
});

export type Swell = { height: number; dx: number; dz: number };

export function swellAt(x: number, z: number, t: number): Swell {
  let height = 0;
  let dx = 0;
  let dz = 0;
  for (const wave of WAVES) {
    const theta = wave.kx * x + wave.kz * z - wave.omega * t + wave.phase;
    const e = Math.exp(Math.sin(theta) - 1);
    const slope = wave.amp * e * Math.cos(theta);
    height += wave.amp * (e - MEAN);
    dx += slope * wave.kx;
    dz += slope * wave.kz;
  }
  return { height, dx, dz };
}

export type Stillness = {
  /** Where a resting pointer meets the water, if it does. */
  pointer: { x: number; z: number } | null;
  /** 0..1: how settled the pointer is. */
  wake: number;
  /** 0..1: how far the water has opened for the desk. */
  spread: number;
  /** Half the width of the still water the desk needs, in world units. */
  channel: number;
};

function smoothstep(from: number, to: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

/** How much of the swell is left at a point: 1 open sea, 0 still water. */
export function calmAt(x: number, z: number, still: Stillness): number {
  let swell = 1;
  if (still.pointer && still.wake > 0) {
    const dx = x - still.pointer.x;
    const dz = z - still.pointer.z;
    swell *= 1 - Math.min(1, still.wake) * Math.exp(-(dx * dx + dz * dz) / (POOL * POOL));
  }
  if (still.spread > 0) {
    const spread = Math.min(1, still.spread);
    swell *= 1 - spread * (1 - smoothstep(-1, 3.2, Math.abs(x) - spread * still.channel));
  }
  return Math.min(1, Math.max(0, swell));
}

const f = (value: number) => value.toFixed(6);

/** The same swell and calm, for the shaders. */
export const SWELL_GLSL = /* glsl */ `
vec3 swellWave(vec2 p, float t, vec2 k, float omega, float amp, float phase) {
  float theta = dot(k, p) - omega * t + phase;
  float e = exp(sin(theta) - 1.0);
  return amp * vec3(e - ${f(MEAN)}, e * cos(theta) * k);
}

// Height, and its slope along x and z.
vec3 swell(vec2 p, float t) {
  return ${WAVES.map((w) => `swellWave(p, t, vec2(${f(w.kx)}, ${f(w.kz)}), ${f(w.omega)}, ${f(w.amp)}, ${f(w.phase)})`).join("\n    + ")};
}

float calmAt(vec2 p, vec2 pointer, float wake, float spread, float channel) {
  vec2 d = p - pointer;
  float left = 1.0 - min(wake, 1.0) * exp(-dot(d, d) / ${f(POOL * POOL)});
  float open = min(spread, 1.0);
  left *= 1.0 - open * (1.0 - smoothstep(-1.0, 3.2, abs(p.x) - open * channel));
  return clamp(left, 0.0, 1.0);
}
`;
