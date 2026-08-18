import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "../app/globals.css"), "utf8");

function token(name: string): string {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`token --color-${name} not found in globals.css`);
  return match[1];
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("colour tokens", () => {
  it("renders the Arrived label at AA against paper", () => {
    // 11px uppercase copy — normal-size text, so the 4.5:1 threshold applies.
    expect(contrast(token("arrived-label"), token("paper"))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps body ink well clear of the threshold", () => {
    expect(contrast(token("ink"), token("paper"))).toBeGreaterThanOrEqual(7);
    expect(contrast(token("ink-muted"), token("paper"))).toBeGreaterThanOrEqual(4.5);
  });

  it("renders the leaf call to action at AA against paper", () => {
    expect(contrast(token("leaf"), token("paper"))).toBeGreaterThanOrEqual(4.5);
  });
});
