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
  const [visibleLines, setVisibleLines] = useState(0);
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

    // Line timing: controlled by JS for precise timing
    // Line 0 at 200ms (render buffer), line 1 at 1700ms (1.5s solo beat), then cascade
    const lineTimings = [200, 1700, 2300, 2800, 3100];
    const lineTimers = lineTimings.map((delay, idx) => 
      setTimeout(() => setVisibleLines(idx + 1), delay)
    );

    const floodTimer = setTimeout(() => setPhase("flood"), 3800);
    const clearTimer = setTimeout(() => setPhase("clearing"), 4500);
    const settleTimer = setTimeout(() => setPhase("settled"), 7500);

    return () => {
      if (!animationStarted.current) {
        lineTimers.forEach(clearTimeout);
        clearTimeout(floodTimer);
        clearTimeout(clearTimer);
        clearTimeout(settleTimer);
      }
    };
  }, []);

  const torrentLines = generateFloodLines(30);

  return (
    <div className={`hero-animation hero-animation--${phase}`}>
      {/* Sequential arrival - lines appear one at a time, controlled by JS */}
      {(phase === "building") && (
        <div className="arrival-stage" aria-hidden="true">
          {heroLines.slice(0, visibleLines).map((line, idx) => (
            <div 
              key={idx} 
              className="arrival-line arrival-line-visible"
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
