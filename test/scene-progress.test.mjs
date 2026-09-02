import assert from "node:assert/strict";
import test from "node:test";

import { sceneProgress } from "../src/lib/scene-progress.ts";

const VIEWPORT = 613;
const TOP = 2000;

/** Progress the observed tier reports for a scene at `top`, scrolled to `y`. */
const at = (y, height, range) => sceneProgress(TOP, height, y, VIEWPORT, range);

test("cover runs 0 -> 1 across the whole pass", () => {
  const height = 400;
  assert.equal(at(TOP - VIEWPORT, height, "cover"), 0);
  assert.equal(at(TOP + height, height, "cover"), 1);
  assert.equal(
    at(TOP - VIEWPORT + (VIEWPORT + height) / 2, height, "cover").toFixed(3),
    "0.500",
  );
});

test("entry ends where contain begins, exit begins where contain ends", () => {
  const height = 400;
  const containStart = Math.max(VIEWPORT - height, 0);
  const containEnd = Math.min(VIEWPORT - height, 0);

  assert.equal(at(TOP - containStart, height, "entry"), 1);
  assert.equal(at(TOP - containStart, height, "contain"), 0);
  assert.equal(at(TOP - containEnd, height, "contain"), 1);
  assert.equal(at(TOP - containEnd, height, "exit"), 0);
});

test("progress is clamped to 0..1 outside the range", () => {
  for (const range of ["cover", "contain", "entry", "exit"]) {
    assert.equal(at(-100_000, 400, range), 0, `${range} before`);
    assert.equal(at(100_000, 400, range), 1, `${range} after`);
  }
});

/**
 * Regression — `contain` on a scene exactly as tall as the viewport.
 *
 * The range collapses to a single scroll position there, and the tier used to
 * answer a flat 1 for every scroll position, i.e. it reported a scene as
 * finished long before it had arrived. Measured against a real ViewTimeline in
 * Chrome 152, the native tier degenerates to a step: 0 while the scene's top
 * edge is still below the viewport top, 1 from the moment it reaches it
 * (offset === 0 inclusive). The three cases below are the knife edge and the
 * one pixel either side of it, which were already correct and must stay so.
 */
test("contain degenerates to a step when the scene is exactly viewport height", () => {
  const height = VIEWPORT;

  assert.equal(at(TOP - 3, height, "contain"), 0, "3px before arrival");
  assert.equal(at(TOP - 1, height, "contain"), 0, "1px before arrival");
  assert.equal(at(TOP, height, "contain"), 1, "exactly at arrival");
  assert.equal(at(TOP + 1, height, "contain"), 1, "1px after arrival");
  assert.equal(at(TOP + 3, height, "contain"), 1, "3px after arrival");
});

test("contain stays continuous across the knife edge", () => {
  // One pixel either side of the degenerate case behaves like the limit of it:
  // a range one pixel long, which is a step in all but name.
  for (const height of [VIEWPORT - 1, VIEWPORT + 1]) {
    assert.equal(at(TOP - 3, height, "contain"), 0, `h=${height} before`);
    assert.equal(at(TOP + 3, height, "contain"), 1, `h=${height} after`);
  }
});

test("a zero-height scene never reports a stale 1", () => {
  // The other way a range can collapse. `entry` and `exit` both have zero span
  // for a scene with no height; neither may claim to be finished early.
  assert.equal(at(TOP - VIEWPORT - 10, 0, "entry"), 0);
  assert.equal(at(TOP - VIEWPORT + 10, 0, "entry"), 1);
  assert.equal(at(TOP - 10, 0, "exit"), 0);
  assert.equal(at(TOP + 10, 0, "exit"), 1);
});
