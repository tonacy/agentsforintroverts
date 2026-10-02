import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { setReducedMotion } from "../../vitest.setup";
import Home from "./page";

describe("Home", () => {
  it("tells one arc after the opening: the piece, where it's made, what comes back, then follow along", () => {
    setReducedMotion(true);
    // A detached container checks our markup without fetching Substack in unit tests.
    const { container } = render(<Home />, { container: document.createElement("div") });
    const headings = Array.from(container.querySelectorAll("h2")).map((h) => h.textContent?.trim());
    const order = [
      "You just watched one come together.",
      "Where the loop lives.",
      "Their answers land on your desk.",
      "See what takes shape.",
    ].map((title) => headings.indexOf(title));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(headings).not.toContain("It still sounds like you.");
  });
});
