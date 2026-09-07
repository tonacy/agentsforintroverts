import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDay, exampleDay } from "./day";

function valid() {
  return JSON.parse(JSON.stringify(exampleDay)) as Record<string, unknown>;
}

describe("parseDay", () => {
  it("accepts the bundled example day", () => {
    expect(parseDay(exampleDay).schema).toBe("afi.public_day.v1");
  });

  it("accepts the committed content file the site renders", () => {
    const raw = readFileSync(resolve(__dirname, "../content/day.json"), "utf8");
    const day = parseDay(JSON.parse(raw));
    expect(day.weekday.length).toBeGreaterThan(0);
  });

  it("rejects the wrong schema", () => {
    const d = valid();
    d.schema = "afi.public_day.v0";
    expect(() => parseDay(d)).toThrow(/schema/);
  });

  it("caps places at three and outside developments at three", () => {
    const d = valid();
    const places = d.places as unknown[];
    d.places = [...places, ...places, ...places].slice(0, 4);
    expect(() => parseDay(d)).toThrow(/places/);

    const e = valid();
    const outside = e.outside as unknown[];
    e.outside = [...outside, ...outside].slice(0, 4);
    expect(() => parseDay(e)).toThrow(/outside/);
  });

  it("requires every outside development to open to at least one https source", () => {
    const d = valid();
    const outside = d.outside as Array<{ sources: Array<{ url: string }> }>;
    outside[0].sources = [];
    expect(() => parseDay(d)).toThrow(/source/);

    const e = valid();
    const outsideE = e.outside as Array<{ sources: Array<{ url: string }> }>;
    outsideE[0].sources[0].url = "http://example.com";
    expect(() => parseDay(e)).toThrow(/https/);
  });

  it("insists that nothing on a public day was sent", () => {
    const d = valid();
    d.nothing_sent = false;
    expect(() => parseDay(d)).toThrow(/nothing_sent/);
  });

  it("allows a day with no inside account and no places", () => {
    const d = valid();
    d.inside = null;
    d.places = [];
    d.mode = "no_new_input";
    const day = parseDay(d);
    expect(day.inside).toBeNull();
    expect(day.places).toHaveLength(0);
  });
});
