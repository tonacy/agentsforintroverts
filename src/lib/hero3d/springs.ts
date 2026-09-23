/** A value that chases a target: scroll sets where things go, springs decide how. */
export type Spring = { value: number; velocity: number };

/**
 * One step of a critically damped spring. It reaches its target without
 * overshoot, and because the step is exact for a fixed target, it moves the
 * same at any frame rate. `halfLife` is the time to close half the distance.
 */
export function stepSpring(spring: Spring, target: number, dt: number, halfLife: number): Spring {
  const y = (2 * Math.LN2) / (halfLife + 1e-5);
  const j0 = spring.value - target;
  const j1 = spring.velocity + j0 * y;
  const decay = Math.exp(-y * dt);
  return {
    value: decay * (j0 + j1 * dt) + target,
    velocity: decay * (spring.velocity - j1 * y * dt),
  };
}
