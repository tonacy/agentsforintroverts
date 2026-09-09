import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { setReducedMotion } from "../../vitest.setup";
import { Crossing, LINE_A, LINE_B } from "./Crossing";

describe("Crossing", () => {
  beforeEach(() => setReducedMotion(false));
  afterEach(() => vi.restoreAllMocks());

  it("renders both lines of the thesis in the document so nothing depends on scrolling", () => {
    render(<Crossing />);
    expect(screen.getByText(LINE_A)).toBeInTheDocument();
    expect(screen.getByText(LINE_B)).toBeInTheDocument();
  });

  it("keeps the sea out of the accessibility tree", () => {
    const { container } = render(<Crossing />);
    const sea = container.querySelector(".sea");
    expect(sea).not.toBeNull();
    expect(sea).toHaveAttribute("aria-hidden", "true");
  });

  it("exposes the headline as the page's h1", () => {
    render(<Crossing />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("holds still for a visitor who prefers reduced motion", () => {
    setReducedMotion(true);
    const { container } = render(<Crossing />);
    const stage = container.querySelector("[data-stage]");
    expect(stage).toHaveAttribute("data-motion", "reduced");
    expect(stage).toHaveStyle({ "--line-a": "1", "--line-b": "1" });
  });

  it("drives the stage with progress when motion is allowed", () => {
    const { container } = render(<Crossing />);
    const stage = container.querySelector("[data-stage]");
    expect(stage).toHaveAttribute("data-motion", "scroll");
  });

  it("keeps a decorative static fallback and readable copy when WebGL is unavailable", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const { container } = render(<Crossing />);
    expect(container.querySelector(".contour-sea")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".contour-sea__still")).toBeInTheDocument();
    expect(container.querySelector("canvas")).not.toHaveAttribute("data-ready");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(LINE_A);
  });

  it("does not allocate a graphics context or schedule animation with reduced motion", () => {
    setReducedMotion(true);
    const graphics = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    const animate = vi.spyOn(window, "requestAnimationFrame");
    render(<Crossing />);
    expect(graphics).not.toHaveBeenCalled();
    expect(animate).not.toHaveBeenCalled();
  });

  it("respects preference changes, including after the tab becomes visible again", () => {
    const motion = Object.assign(new EventTarget(), { matches: false });
    vi.spyOn(window, "matchMedia").mockReturnValue(motion as unknown as MediaQueryList);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const animate = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    const { container } = render(<Crossing />);
    const stage = container.querySelector("[data-stage]");

    act(() => {
      motion.matches = true;
      motion.dispatchEvent(new Event("change"));
    });
    expect(stage).toHaveAttribute("data-motion", "reduced");
    expect(stage).toHaveStyle({ "--line-a": "1", "--line-b": "1" });
    animate.mockClear();
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(animate).not.toHaveBeenCalled();

    act(() => {
      motion.matches = false;
      motion.dispatchEvent(new Event("change"));
    });
    expect(stage).toHaveAttribute("data-motion", "scroll");
    expect(animate).toHaveBeenCalledTimes(1);
  });
});
