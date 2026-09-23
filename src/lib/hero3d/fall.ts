/**
 * A sheet of paper dropped onto a desk. It glides down with a little sway,
 * tilting into each swing and flexing as it goes, then lands and settles.
 * Driven by its own clock in real time, so the fall reads the same however
 * fast the visitor scrolls, and plays backwards if they scroll back.
 */

export const FALL_SECONDS = 1.15;
export const SETTLE_SECONDS = 0.55;
const TOTAL = FALL_SECONDS + SETTLE_SECONDS;

export type FallPose = {
  /** Offsets from the resting place, in world units. */
  x: number;
  y: number;
  z: number;
  /** Tilts and spin, in radians. */
  pitch: number;
  roll: number;
  yaw: number;
  /** How far the sheet flexes along its length. */
  bend: number;
  opacity: number;
  /** How dark its shadow on the desk is, 0..1. */
  shadow: number;
};

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Forward while dropped; back, a little faster, when the visitor scrolls up. */
export function advanceClock(clock: number, dropped: boolean, dt: number): number {
  return dropped ? Math.min(TOTAL, clock + dt) : Math.max(0, clock - dt * 1.6);
}

export function fallPose(clock: number, seed: number, height: number): FallPose {
  const u = clamp01(clock / FALL_SECONDS);
  const settle = clock > FALL_SECONDS ? clamp01((clock - FALL_SECONDS) / SETTLE_SECONDS) : 0;
  const phase = seed * Math.PI * 2;
  const left = 1 - u;
  const sway = 0.55 * (0.8 + 0.4 * seed);
  const swing = Math.PI * 2 * 1.2 * u + phase;
  const drift = Math.PI * 2 * 0.85 * u + phase * 1.7;
  const y = height * Math.pow(left, 1.35);
  const flap = 0.06 * Math.exp(-settle * 6) * Math.sin(settle * 14) * (1 - settle);
  return {
    x: sway * Math.sin(swing) * Math.pow(left, 0.9),
    y,
    z: sway * 0.55 * Math.sin(drift) * left,
    pitch: 0.32 * Math.cos(drift) * left,
    roll: 0.5 * Math.cos(swing) * Math.pow(left, 0.9),
    yaw: (seed - 0.5) * 1.1 * Math.pow(left, 1.6),
    bend: 0.28 * Math.sin(swing + 0.9) * left + flap,
    opacity: clamp01(u / 0.12),
    shadow: Math.pow(1 - y / height, 2),
  };
}
