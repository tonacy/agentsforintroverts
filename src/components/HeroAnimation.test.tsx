import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { StrictMode } from "react";
import { render, screen, act } from "@testing-library/react";
import { setReducedMotion } from "../../vitest.setup";
import { HeroAnimation } from "./HeroAnimation";
import { OPENING_DURATION_MS } from "@/lib/opening";

function renderOpening() {
  return render(
    <HeroAnimation>
      <p>Thursday morning is still yours.</p>
    </HeroAnimation>,
  );
}

describe("HeroAnimation", () => {
  beforeEach(() => {
    setReducedMotion(false);
    window.sessionStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("never blocks the hero content, sequence or no sequence", () => {
    renderOpening();
    expect(screen.getByText("Thursday morning is still yours.")).toBeInTheDocument();
  });

  it("marks itself as playing once mounted on the client", () => {
    const { container } = renderOpening();
    const root = container.querySelector(".hero-open");
    expect(root).not.toBeNull();
    expect(root).toHaveClass("hero-open--playing");
  });

  it("renders the sequence-only layers while playing, and drops them when it ends", () => {
    const { container } = renderOpening();
    expect(container.querySelector(".hero-open__sequence")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(OPENING_DURATION_MS + 100);
    });

    expect(container.querySelector(".hero-open__sequence")).toBeNull();
    expect(container.querySelector(".hero-open")).not.toHaveClass("hero-open--playing");
  });

  it("stays at rest for a visitor who prefers reduced motion", () => {
    setReducedMotion(true);
    const { container } = renderOpening();
    expect(container.querySelector(".hero-open")).not.toHaveClass("hero-open--playing");
    expect(container.querySelector(".hero-open__sequence")).toBeNull();
    expect(screen.getByText("Thursday morning is still yours.")).toBeInTheDocument();
  });

  it("does not replay on a second mount in the same session", () => {
    const first = renderOpening();
    expect(first.container.querySelector(".hero-open")).toHaveClass("hero-open--playing");
    first.unmount();

    const second = renderOpening();
    expect(second.container.querySelector(".hero-open")).not.toHaveClass("hero-open--playing");
    expect(second.container.querySelector(".hero-open__sequence")).toBeNull();
  });

  it("survives StrictMode's double-invoked effect without burning the claim", () => {
    const { container } = render(
      <StrictMode>
        <HeroAnimation>
          <p>Thursday morning is still yours.</p>
        </HeroAnimation>
      </StrictMode>,
    );

    // React mounts, unmounts and remounts the same fiber in development. The ref
    // guard must keep the decision, not re-ask and get a refusal the second time.
    expect(container.querySelector(".hero-open")).toHaveClass("hero-open--playing");
    expect(container.querySelector(".hero-open__sequence")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(OPENING_DURATION_MS + 100);
    });

    expect(container.querySelector(".hero-open__sequence")).toBeNull();
  });

  it("keeps the sequence layers out of the accessibility tree", () => {
    const { container } = renderOpening();
    const sequence = container.querySelector(".hero-open__sequence");
    expect(sequence).toHaveAttribute("aria-hidden", "true");
  });
});
