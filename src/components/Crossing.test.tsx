import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { setReducedMotion } from "../../vitest.setup";
import { Crossing, FINALE, LINE_A, LINE_B, STEPS } from "./Crossing";

describe("Crossing", () => {
  beforeEach(() => setReducedMotion(false));
  afterEach(() => vi.restoreAllMocks());

  it("renders both lines of the thesis in the document so nothing depends on scrolling", () => {
    render(<Crossing />);
    expect(screen.getByText(LINE_A)).toBeInTheDocument();
    expect(screen.getByText(LINE_B)).toBeInTheDocument();
  });

  it("tells the whole story in the document, in order, without scrolling", () => {
    render(<Crossing />);
    const titles = STEPS.map((step) => screen.getByText(step.title));
    for (const step of STEPS) expect(screen.getByText(step.detail)).toBeInTheDocument();
    for (let i = 1; i < titles.length; i += 1) {
      expect(titles[i - 1].compareDocumentPosition(titles[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("says who does each step, and that the person's part is the small part", () => {
    const { container } = render(<Crossing />);
    const labels = Array.from(container.querySelectorAll(".crossing__step-n")).map((n) => n.textContent);
    expect(labels).toEqual(["01 · you", "02 · your agents", "03 · you", "04 · your agents"]);
  });

  it("ends on the people the work was for, not on publishing", () => {
    render(<Crossing />);
    expect(screen.getByText(FINALE)).toBeInTheDocument();
  });

  it("keeps the desk of paper out of the accessibility tree", () => {
    const { container } = render(<Crossing />);
    expect(container.querySelector(".board")).toHaveAttribute("aria-hidden", "true");
  });

  it("offers a way past the passage", () => {
    render(<Crossing />);
    expect(screen.getByRole("link", { name: /skip ahead/i })).toHaveAttribute("href", "#practice");
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

  it("holds still for a visitor who prefers reduced motion, with every step showing", () => {
    setReducedMotion(true);
    const { container } = render(<Crossing />);
    const stage = container.querySelector("[data-stage]");
    expect(stage).toHaveAttribute("data-motion", "reduced");
    expect(stage).toHaveStyle({
      "--line-a": "1",
      "--line-b": "1",
      "--step-bring": "1",
      "--step-shape": "1",
      "--step-mark": "1",
      "--step-travel": "1",
      "--step-answer": "1",
    });
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

  it("falls back to the flat passage when the 3D opening is asked for but WebGL is unavailable", async () => {
    window.history.replaceState(null, "", "/?hero=3d");
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    try {
      const { container } = render(<Crossing />);
      const stage = container.querySelector("[data-stage]");
      await vi.waitFor(() => expect(stage).toHaveAttribute("data-hero", "flat"), { timeout: 10_000 });
      expect(container.querySelector(".sea")).toBeInTheDocument();
    } finally {
      window.history.replaceState(null, "", "/");
    }
  }, 15_000);

  it("never loads the 3D opening for a visitor who prefers reduced motion", () => {
    window.history.replaceState(null, "", "/?hero=3d");
    setReducedMotion(true);
    try {
      const { container } = render(<Crossing />);
      expect(container.querySelector("[data-stage]")).not.toHaveAttribute("data-hero");
    } finally {
      window.history.replaceState(null, "", "/");
    }
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
