"use client";

import { useState, useEffect, useRef } from "react";

const heroLines = [
  "email · a reply",
  "calendar · an ask",
  "X · a mention",
  "LinkedIn · an intro",
  "newsletter · a request",
];

const floodLines = [
  "email · a reply",
  "email · a follow-up",
  "calendar · an ask",
  "X · a mention",
  "X · a thread",
  "LinkedIn · an intro",
  "newsletter · a request",
  "email · an invite",
];

function generateFloodLines(count: number): string[] {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    lines.push(floodLines[i % floodLines.length]);
  }
  return lines;
}

export function HeroAnimation({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<"building" | "flood" | "clearing" | "settled">("settled");
  const animationStarted = useRef(false);

  useEffect(() => {
    if (animationStarted.current) return;
    
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hasPlayed = sessionStorage.getItem("hero-animation-played");
    
    if (prefersReducedMotion || hasPlayed) return;
    
    animationStarted.current = true;
    sessionStorage.setItem("hero-animation-played", "1");
    
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: trigger animation on client mount
    setPhase("building");

    // Lines arrive one by one, then crescendo ~2.5s, then flood
    const floodTimer = setTimeout(() => {
      setPhase("flood");
    }, 2800);

    // Hold on flood ~0.7s, then clearing
    const clearTimer = setTimeout(() => {
      setPhase("clearing");
    }, 3500);

    // Total ~6s
    const settleTimer = setTimeout(() => {
      setPhase("settled");
    }, 6000);

    return () => {
      if (!animationStarted.current) {
        clearTimeout(floodTimer);
        clearTimeout(clearTimer);
        clearTimeout(settleTimer);
      }
    };
  }, []);

  const torrentLines = generateFloodLines(30);

  return (
    <div className={`hero-animation hero-animation--${phase}`}>
      {/* Sequential arrival - lines appear one at a time */}
      {(phase === "building") && (
        <div className="arrival-stage" aria-hidden="true">
          {heroLines.map((line, idx) => (
            <div 
              key={idx} 
              className={`arrival-line arrival-line-${idx}`}
            >
              {line}
            </div>
          ))}
        </div>
      )}

      {/* Full-bleed torrent flood - crescendo and hold */}
      {(phase === "flood" || phase === "clearing") && (
        <div className="torrent-flood" aria-hidden="true">
          <div className="torrent-flood-inner">
            {Array.from({ length: 6 }).map((_, colIdx) => (
              <div key={colIdx} className="torrent-flood-column">
                {torrentLines.map((line, lineIdx) => (
                  <div key={lineIdx} className="torrent-flood-line">
                    {line}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sun clearing effect */}
      {phase === "clearing" && (
        <div className="sun-clear" aria-hidden="true" />
      )}

      {/* Main content with reveal */}
      <div className="hero-content">
        {children}
      </div>
    </div>
  );
}
