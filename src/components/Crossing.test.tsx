import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { setReducedMotion } from "../../vitest.setup";
import { Crossing, LINE_A, LINE_B } from "./Crossing";
import { exampleDay } from "@/lib/day";

describe("Crossing", () => {
  beforeEach(() => setReducedMotion(false));

  it("renders both lines of the thesis in the document so nothing depends on scrolling", () => {
    render(<Crossing day={exampleDay} />);
    expect(screen.getByText(LINE_A)).toBeInTheDocument();
    expect(screen.getByText(LINE_B)).toBeInTheDocument();
  });

  it("keeps the sea out of the accessibility tree", () => {
    const { container } = render(<Crossing day={exampleDay} />);
    const sea = container.querySelector(".sea");
    expect(sea).not.toBeNull();
    expect(sea).toHaveAttribute("aria-hidden", "true");
  });

  it("exposes the headline as the page's h1", () => {
    render(<Crossing day={exampleDay} />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("holds still for a visitor who prefers reduced motion", () => {
    setReducedMotion(true);
    const { container } = render(<Crossing day={exampleDay} />);
    const stage = container.querySelector("[data-stage]");
    expect(stage).toHaveAttribute("data-motion", "reduced");
  });

  it("drives the stage with progress when motion is allowed", () => {
    const { container } = render(<Crossing day={exampleDay} />);
    const stage = container.querySelector("[data-stage]");
    expect(stage).toHaveAttribute("data-motion", "scroll");
  });
});
