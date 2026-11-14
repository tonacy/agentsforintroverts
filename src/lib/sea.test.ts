import { describe, it, expect } from "vitest";
import { FRAGMENT_POOL } from "./sea";

describe("FRAGMENT_POOL", () => {
  it("names where each notice came from and what it is, without repeats", () => {
    expect(new Set(FRAGMENT_POOL).size).toBe(FRAGMENT_POOL.length);
    for (const fragment of FRAGMENT_POOL) expect(fragment).toMatch(/^.+ · .+$/);
  });
});
