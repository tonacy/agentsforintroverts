import { describe, it, expect } from "vitest";
import { stageProgress, stageLayers, seaRate } from "./stage-progress";

describe("stageProgress", () => {
  // A stage is a tall wrapper with a sticky viewport-high child. Progress is
  // how far the wrapper has scrolled through its own extra height.
  it("is 0 before the stage reaches the top of the viewport", () => {
    expect(stageProgress(1000, 3000, 0, 800)).toBe(0);
    expect(stageProgress(1000, 3000, 999, 800)).toBe(0);
  });

  it("is 1 once the sticky child is about to unstick", () => {
    expect(stageProgress(0, 3000, 2200, 800)).toBe(1);
    expect(stageProgress(0, 3000, 5000, 800)).toBe(1);
  });

  it("runs linearly in between", () => {
    expect(stageProgress(0, 3000, 1100, 800)).toBeCloseTo(0.5, 5);
    expect(stageProgress(400, 2400, 1200, 800)).toBeCloseTo(0.5, 5);
  });

  it("degenerates to a step when the stage has no extra height", () => {
    expect(stageProgress(500, 800, 499, 800)).toBe(0);
    expect(stageProgress(500, 800, 500, 800)).toBe(1);
  });
});

describe("seaRate", () => {
  it("runs at full speed on arrival and slows to a crawl, never stopping", () => {
    expect(seaRate(0)).toBe(1);
    expect(seaRate(1)).toBeGreaterThan(0);
    expect(seaRate(1)).toBeLessThan(0.15);
    expect(seaRate(0.5)).toBeLessThan(seaRate(0.25));
  });
});

describe("stageLayers", () => {
  it("shows only the first line on arrival", () => {
    const at0 = stageLayers(0);
    expect(at0.lineA).toBe(1);
    expect(at0.lineB).toBe(0);
    expect(at0.ledger).toBe(0);
    expect(at0.seaOpacity).toBe(1);
    expect(at0.spread).toBe(0);
  });

  it("hands over to the second line in the middle", () => {
    const mid = stageLayers(0.47);
    expect(mid.lineA).toBe(0);
    expect(mid.lineB).toBe(1);
    expect(mid.ledger).toBe(0);
  });

  it("ends on the ledger with the sea parted and quiet", () => {
    const end = stageLayers(1);
    expect(end.lineA).toBe(0);
    expect(end.lineB).toBe(0);
    expect(end.ledger).toBe(1);
    expect(end.spread).toBe(1);
    expect(end.seaOpacity).toBeLessThan(0.4);
    expect(end.seaOpacity).toBeGreaterThan(0);
  });

  it("never shows two lines at full strength at once", () => {
    for (let p = 0; p <= 1; p += 0.01) {
      const l = stageLayers(p);
      const full = [l.lineA, l.lineB, l.ledger].filter((v) => v >= 0.99).length;
      expect(full).toBeLessThanOrEqual(1);
    }
  });

  it("clamps out-of-range progress", () => {
    expect(stageLayers(-1)).toEqual(stageLayers(0));
    expect(stageLayers(2)).toEqual(stageLayers(1));
  });
});
