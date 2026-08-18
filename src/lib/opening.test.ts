import { describe, it, expect, beforeEach } from "vitest";
import { setReducedMotion } from "../../vitest.setup";
import {
  OPENING_SESSION_KEY,
  OPENING_DURATION_MS,
  shouldPlayOpening,
  claimOpening,
} from "./opening";

describe("shouldPlayOpening", () => {
  beforeEach(() => {
    setReducedMotion(false);
    window.sessionStorage.clear();
  });

  it("plays for a first-time visitor who has not asked for less motion", () => {
    expect(shouldPlayOpening(window)).toBe(true);
  });

  it("does not play when the visitor prefers reduced motion", () => {
    setReducedMotion(true);
    expect(shouldPlayOpening(window)).toBe(false);
  });

  it("does not play again once this session has seen it", () => {
    window.sessionStorage.setItem(OPENING_SESSION_KEY, "1");
    expect(shouldPlayOpening(window)).toBe(false);
  });

  it("reduced motion wins even on a fresh session", () => {
    setReducedMotion(true);
    window.sessionStorage.clear();
    expect(shouldPlayOpening(window)).toBe(false);
  });
});

describe("claimOpening", () => {
  beforeEach(() => {
    setReducedMotion(false);
    window.sessionStorage.clear();
  });

  it("hands the sequence to the first caller only", () => {
    expect(claimOpening(window)).toBe(true);
    expect(claimOpening(window)).toBe(false);
  });

  it("marks the session so a later check agrees", () => {
    claimOpening(window);
    expect(window.sessionStorage.getItem(OPENING_SESSION_KEY)).not.toBeNull();
    expect(shouldPlayOpening(window)).toBe(false);
  });

  it("does not claim anything under reduced motion", () => {
    setReducedMotion(true);
    expect(claimOpening(window)).toBe(false);
    expect(window.sessionStorage.getItem(OPENING_SESSION_KEY)).toBeNull();
  });

  it("still plays when sessionStorage is unavailable", () => {
    const blocked = {
      matchMedia: window.matchMedia,
      get sessionStorage(): Storage {
        throw new Error("SecurityError: storage is disabled");
      },
    } as unknown as Window;
    expect(() => claimOpening(blocked)).not.toThrow();
    expect(claimOpening(blocked)).toBe(true);
  });
});

describe("OPENING_DURATION_MS", () => {
  it("covers the whole beat sheet, which ends at 7.20s", () => {
    expect(OPENING_DURATION_MS).toBeGreaterThanOrEqual(7200);
  });
});
