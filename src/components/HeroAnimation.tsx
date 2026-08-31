"use client";

import Image from "next/image";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  claimOpening,
  OPENING_DURATION_MS,
  OPENING_SESSION_KEY,
} from "@/lib/opening";

const arrivalLines = [
  { delay: "0.15s", left: "50%", top: "52%", size: "19px", text: "email · a reply" },
  { delay: "0.95s", left: "50%", top: "45%", size: "18px", text: "calendar · an ask" },
  { delay: "1.60s", left: "33%", top: "56%", size: "16px", text: "X · a mention" },
  { delay: "1.80s", left: "66%", top: "40%", size: "16px", text: "email · a follow-up" },
  { delay: "2.00s", left: "39%", top: "34%", size: "15px", text: "LinkedIn · an intro" },
  { delay: "2.18s", left: "61%", top: "62%", size: "15px", text: "newsletter · a request" },
  { delay: "2.32s", left: "24%", top: "44%", size: "14px", text: "X · a thread" },
  { delay: "2.44s", left: "76%", top: "55%", size: "14px", text: "email · an invite" },
] as const;

type MotionStyle = CSSProperties & { "--d"?: string };

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

      <div className="hero-open__sequence" aria-hidden="true">
        <div className="hero-open__vignette" />

        <div className="hero-open__arrivals">
          {arrivalLines.map((line) => (
            <div
              className="hero-open__arrival-seat"
              key={`${line.delay}-${line.text}`}
              style={{ left: line.left, top: line.top }}
            >
              <div
                className="hero-open__arrival"
                style={{ "--d": line.delay, fontSize: line.size } as MotionStyle}
              >
                {line.text}
              </div>
            </div>
          ))}
        </div>

        <div className="hero-open__focus">
          <Image
            src="/brand/human-focus.png"
            alt=""
            width={32}
            height={32}
          />
        </div>
      </div>

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
