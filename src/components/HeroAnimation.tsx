"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  claimOpening,
  OPENING_DURATION_MS,
  OPENING_SESSION_KEY,
} from "@/lib/opening";

type OpeningWindow = Window & {
  __afiOpeningBootTimer?: number;
  __afiOpeningStartedAt?: number;
};

const openingBootScript = `(() => {
  const root = document.currentScript?.parentElement;
  if (!root) return;

  const openingWindow = window;
  let shouldPlay = false;

  if (
    !openingWindow.location.hash &&
    openingWindow.matchMedia("(min-width: 900px)").matches &&
    !openingWindow.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    try {
      shouldPlay = openingWindow.sessionStorage.getItem(${JSON.stringify(OPENING_SESSION_KEY)}) === null;
      if (shouldPlay) {
        openingWindow.sessionStorage.setItem(${JSON.stringify(OPENING_SESSION_KEY)}, "1");
      }
    } catch {
      shouldPlay = true;
    }
  }

  if (!shouldPlay) return;

  openingWindow.__afiOpeningStartedAt = openingWindow.performance.now();
  root.dataset.opening = "playing";
  openingWindow.__afiOpeningBootTimer = openingWindow.setTimeout(() => {
    root.removeAttribute("data-opening");
    delete openingWindow.__afiOpeningStartedAt;
    delete openingWindow.__afiOpeningBootTimer;
  }, ${OPENING_DURATION_MS});
})();`;

export function HeroAnimation({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const openingTimerRef = useRef<number | null>(null);

  const finishOpening = useCallback((focusLanding = false) => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const openingWindow = window as OpeningWindow;

    if (openingWindow.__afiOpeningBootTimer !== undefined) {
      window.clearTimeout(openingWindow.__afiOpeningBootTimer);
      delete openingWindow.__afiOpeningBootTimer;
    }

    if (openingTimerRef.current !== null) {
      window.clearTimeout(openingTimerRef.current);
      openingTimerRef.current = null;
    }

    root.removeAttribute("data-opening");
    delete openingWindow.__afiOpeningStartedAt;

    if (focusLanding) {
      root.querySelector<HTMLElement>("#hero-headline")?.focus({
        preventScroll: true,
      });
    }
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const openingWindow = window as OpeningWindow;
    const startedBeforeHydration = root.dataset.opening === "playing";
    const claimedOnNavigation = startedBeforeHydration ? false : claimOpening(window);

    if (!startedBeforeHydration && claimedOnNavigation) {
      openingWindow.__afiOpeningStartedAt = performance.now();
      root.dataset.opening = "playing";
    }

    if (root.dataset.opening !== "playing") {
      return;
    }

    const finishForExplicitDestination = () => {
      if (window.location.hash) {
        finishOpening();
      }
    };

    window.addEventListener("hashchange", finishForExplicitDestination);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia("(min-width: 900px)");
    const finishForPreference = () => {
      if (reducedMotion.matches || !desktop.matches) finishOpening();
    };
    reducedMotion.addEventListener("change", finishForPreference);
    desktop.addEventListener("change", finishForPreference);

    if (openingWindow.__afiOpeningBootTimer !== undefined) {
      window.clearTimeout(openingWindow.__afiOpeningBootTimer);
      delete openingWindow.__afiOpeningBootTimer;
    }

    const startedAt = openingWindow.__afiOpeningStartedAt ?? performance.now();
    openingWindow.__afiOpeningStartedAt = startedAt;
    const elapsed = Math.max(0, performance.now() - startedAt);
    const remaining = Math.max(0, OPENING_DURATION_MS - elapsed);

    const settleOpening = () => {
      root.removeAttribute("data-opening");
      delete openingWindow.__afiOpeningStartedAt;
      openingTimerRef.current = null;
    };

    openingTimerRef.current = window.setTimeout(settleOpening, remaining);

    return () => {
      window.removeEventListener("hashchange", finishForExplicitDestination);
      reducedMotion.removeEventListener("change", finishForPreference);
      desktop.removeEventListener("change", finishForPreference);

      if (openingTimerRef.current !== null) {
        window.clearTimeout(openingTimerRef.current);
        openingTimerRef.current = null;
      }
    };
  }, [finishOpening]);

  return (
    <div ref={rootRef} className="hero-open" suppressHydrationWarning>
      <script
        type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: openingBootScript }}
      />

      {children}

      <button
        className="hero-open__skip"
        type="button"
        onClick={() => finishOpening(true)}
      >
        Skip opening
      </button>
    </div>
  );
}
