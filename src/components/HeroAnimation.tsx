"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { claimOpening, OPENING_DURATION_MS } from "@/lib/opening";

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

export function HeroAnimation({ children }: { children: ReactNode }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const openingClaim = useRef<boolean | null>(null);

  useEffect(() => {
    if (openingClaim.current === null) {
      openingClaim.current = claimOpening(window);
    }

    if (!openingClaim.current) {
      return;
    }

    // This begins after hydration so the static export always renders the rest state.
    setIsPlaying(true);

    const timer = window.setTimeout(() => {
      setIsPlaying(false);
    }, OPENING_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className={`hero-open${isPlaying ? " hero-open--playing" : ""}`}>
      {children}

      {isPlaying && (
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

          <div className="hero-open__flash" />
        </div>
      )}
    </div>
  );
}
