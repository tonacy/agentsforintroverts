import { describe, it, expect } from "vitest";
import { buildSea, seaWake, spreadFor, FRAGMENT_POOL } from "./sea";

describe("spreadFor", () => {
  it("maps column index to a signed distance from the centre", () => {
    expect(spreadFor(0, 9)).toBe(-1);
    expect(spreadFor(4, 9)).toBe(0);
    expect(spreadFor(8, 9)).toBe(1);
    expect(spreadFor(0, 1)).toBe(0);
  });
});

describe("buildSea", () => {
  it("is deterministic so the server and client agree", () => {
    const a = buildSea({ columns: 12, lines: 60 });
    const b = buildSea({ columns: 12, lines: 60 });
    expect(a).toEqual(b);
  });

  it("builds the requested number of columns with the requested lines", () => {
    const sea = buildSea({ columns: 7, lines: 40 });
    expect(sea).toHaveLength(7);
    for (const column of sea) {
      expect(column.text.split("\n")).toHaveLength(40);
    }
  });

  it("only ever uses fragments from the pool", () => {
    const pool = new Set<string>(FRAGMENT_POOL);
    const sea = buildSea({ columns: 5, lines: 30 });
    for (const column of sea) {
      for (const line of column.text.split("\n")) {
        expect(pool.has(line)).toBe(true);
      }
    }
  });

  it("gives every column a distinct speed and phase inside sane bounds", () => {
    const sea = buildSea({ columns: 14, lines: 20 });
    const speeds = new Set(sea.map((c) => c.speed));
    expect(speeds.size).toBeGreaterThan(8);
    for (const column of sea) {
      expect(column.speed).toBeGreaterThanOrEqual(0.35);
      expect(column.speed).toBeLessThanOrEqual(1.3);
      expect(column.phase).toBeGreaterThanOrEqual(0);
      expect(column.phase).toBeLessThan(1);
      expect(column.spread).toBeGreaterThanOrEqual(-1);
      expect(column.spread).toBeLessThanOrEqual(1);
    }
  });
});

describe("buildSea seeds", () => {
  it("keeps the default sea stable and lets a second layer differ", () => {
    const main = buildSea({ columns: 4, lines: 8 });
    expect(buildSea({ columns: 4, lines: 8, seed: 1013 })).toEqual(main);
    expect(buildSea({ columns: 4, lines: 8, seed: 4099 }).map((c) => c.text)).not.toEqual(main.map((c) => c.text));
  });
});

describe("seaWake", () => {
  it("parts the columns nearest the pointer and leaves distant ones alone", () => {
    const near = seaWake(0.52, 0.5, 1);
    const far = seaWake(0.95, 0.5, 1);
    expect(near.shift).toBeGreaterThan(20);
    expect(Math.abs(far.shift)).toBeLessThan(0.5);
    expect(seaWake(0.48, 0.5, 1).shift).toBeLessThan(-20);
  });

  it("slows the feed under the pointer but never stops it", () => {
    expect(seaWake(0.5, 0.5, 1).slow).toBeLessThan(0.6);
    expect(seaWake(0.5, 0.5, 1).slow).toBeGreaterThan(0.2);
    expect(seaWake(0.95, 0.5, 1).slow).toBeCloseTo(1, 2);
  });

  it("has no effect without a pointer or once the sea has parted", () => {
    expect(seaWake(0.5, null, 1)).toEqual({ shift: 0, slow: 1 });
    expect(seaWake(0.52, 0.5, 0)).toEqual({ shift: 0, slow: 1 });
  });
});
