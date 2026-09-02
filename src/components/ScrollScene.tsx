"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

import "./scroll-scene.css";

/**
 * Where in the scene's pass across the viewport progress runs 0 -> 1.
 * These mirror the CSS `animation-range` keywords exactly, so the native tier
 * and the observed tier agree to the pixel.
 *
 *   cover   — from the moment the scene's top edge reaches the bottom of the
 *             viewport until its bottom edge leaves the top. The default.
 *   contain — only while the scene is wholly inside the viewport (or, for a
 *             scene taller than the viewport, wholly covering it).
 *   entry   — the arrival half: cover start -> contain start.
 *   exit    — the departure half: contain end -> cover end.
 */
export type ScrollSceneRange = "cover" | "contain" | "entry" | "exit";

/**
 * `auto` picks the best tier available. The other two exist so a scene can be
 * pinned to a tier — `observed` to exercise or force the JS path, `static` to
 * opt a scene out of motion entirely.
 */
export type ScrollSceneTier = "auto" | "observed" | "static";

export type ScrollSceneProps = {
  children: ReactNode;
  /** Element to render. Default `div`. */
  as?: "div" | "section";
  className?: string;
  id?: string;
  style?: CSSProperties;
  range?: ScrollSceneRange;
  tier?: ScrollSceneTier;
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const PROGRESS_PROPERTY = "--scene-progress";

function supportsViewTimeline(): boolean {
  return (
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("animation-timeline", "view()")
  );
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Pure maths — no DOM reads — so the rAF tick never touches layout.
 *
 * `top` is the scene's offset in document space, `height` its measured height.
 * `offset` is the element top expressed relative to the viewport top, which is
 * the same quantity the CSS view-progress timeline is defined against.
 */
export function sceneProgress(
  top: number,
  height: number,
  scrollY: number,
  viewport: number,
  range: ScrollSceneRange,
): number {
  const offset = top - scrollY;

  const coverStart = viewport;
  const coverEnd = -height;
  const containStart = Math.max(viewport - height, 0);
  const containEnd = Math.min(viewport - height, 0);

  let start = coverStart;
  let end = coverEnd;

  if (range === "contain") {
    start = containStart;
    end = containEnd;
  } else if (range === "entry") {
    start = coverStart;
    end = containStart;
  } else if (range === "exit") {
    start = containEnd;
    end = coverEnd;
  }

  const span = start - end;
  if (span <= 0) return 1;

  return clamp01((start - offset) / span);
}

export function ScrollScene({
  children,
  as: Tag = "div",
  className,
  id,
  style,
  range = "cover",
  tier = "auto",
}: ScrollSceneProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const motionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    let stopDriver: (() => void) | null = null;

    /**
     * Tier 2. Only ever reached when the native timeline is unavailable and
     * motion is allowed.
     */
    const startDriver = () => {
      if (stopDriver) return;

      element.dataset.sceneTier = "observed";

      let top = 0;
      let height = 0;
      let measured = false;
      let needsMeasure = true;
      let frame = 0;
      let lastWritten = Number.NaN;

      const tick = () => {
        frame = 0;

        // The single layout read, inside a rAF and always before any write,
        // so it can never interleave with a style write on the same frame.
        if (needsMeasure) {
          const rect = element.getBoundingClientRect();
          top = rect.top + window.scrollY;
          height = rect.height;
          needsMeasure = false;
          measured = true;
        }

        if (!measured) return;

        const next =
          Math.round(
            sceneProgress(top, height, window.scrollY, window.innerHeight, range) *
              1000,
          ) / 1000;

        if (next === lastWritten) return;
        lastWritten = next;
        element.style.setProperty(PROGRESS_PROPERTY, String(next));
      };

      const schedule = () => {
        if (frame) return;
        frame = window.requestAnimationFrame(tick);
      };

      const remeasure = () => {
        needsMeasure = true;
        schedule();
      };

      // The listener stays attached for the driver's lifetime. Gating it on
      // intersection looks cheaper, but a scene that crosses the whole
      // viewport in one jump — an anchor link, scroll restoration, a fling —
      // never fires the observer, and the scene is left frozen at the wrong
      // end of its range. A tick is a dozen arithmetic operations on cached
      // geometry and writes nothing unless the value actually changed, so
      // correctness is worth far more here than the saved frame.
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", remeasure, { passive: true });

      // Geometry only needs re-reading when something moved: the scene's own
      // box (fonts, reflow) or the document above it (anything that grows and
      // pushes the scene down). Both arrive as observer callbacks, so the
      // measurement never happens inside a scroll handler.
      const resizeObserver = new ResizeObserver(remeasure);
      resizeObserver.observe(element);
      resizeObserver.observe(document.documentElement);

      // Entering or leaving the viewport is the other moment worth a fresh
      // measurement, and it settles a scene cleanly on 0 or 1 as it leaves.
      const intersectionObserver = new IntersectionObserver(remeasure, {
        threshold: [0, 1],
      });
      intersectionObserver.observe(element);

      schedule();

      stopDriver = () => {
        intersectionObserver.disconnect();
        resizeObserver.disconnect();
        window.removeEventListener("scroll", schedule);
        window.removeEventListener("resize", remeasure);
        if (frame) window.cancelAnimationFrame(frame);
        element.style.removeProperty(PROGRESS_PROPERTY);
        delete element.dataset.sceneTier;
      };
    };

    const stop = () => {
      if (!stopDriver) return;
      stopDriver();
      stopDriver = null;
    };

    // Re-evaluated whenever the reduced-motion preference flips, so turning
    // motion off mid-session immediately restores the settled static state.
    const sync = () => {
      if (motionQuery.matches || tier === "static") {
        stop();
        return;
      }
      if (tier === "auto" && supportsViewTimeline()) {
        stop();
        return;
      }
      startDriver();
    };

    sync();
    motionQuery.addEventListener("change", sync);

    return () => {
      motionQuery.removeEventListener("change", sync);
      stop();
    };
  }, [range, tier]);

  const sceneStyle = {
    ...style,
    "--scene-range": range,
  } as CSSProperties;

  return (
    <Tag
      ref={ref}
      id={id}
      className={className ? `scroll-scene ${className}` : "scroll-scene"}
      // Rendered into the markup rather than set from the effect, so an opted
      // out scene is static even with JavaScript disabled.
      data-scene-tier={tier === "static" ? "static" : undefined}
      style={sceneStyle}
    >
      {children}
    </Tag>
  );
}
