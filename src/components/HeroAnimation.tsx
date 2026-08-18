"use client";

import { useState, useEffect, useRef } from "react";

const feedLines = [
  "email · a reply",
  "email · a follow-up",
  "calendar · an ask",
  "X · a mention",
  "X · a thread",
  "LinkedIn · an intro",
  "newsletter · a request",
  "email · an invite",
];

function generateTorrentLines(count: number): string[] {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    lines.push(feedLines[i % feedLines.length]);
  }
  return lines;
}

export function HeroAnimation({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<"filling" | "clearing" | "settled">("settled");
  const animationStarted = useRef(false);

  useEffect(() => {
    if (animationStarted.current) return;
    
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hasPlayed = sessionStorage.getItem("hero-animation-played");
    
    if (prefersReducedMotion || hasPlayed) return;
    
    animationStarted.current = true;
    sessionStorage.setItem("hero-animation-played", "1");
    
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: trigger animation on client mount
    setPhase("filling");

    // Build ~1.4s + hold ~0.5s = 1900ms, then clearing
    const clearTimer = setTimeout(() => {
      setPhase("clearing");
    }, 1900);

    // Total ~4s
    const settleTimer = setTimeout(() => {
      setPhase("settled");
    }, 4000);

    return () => {
      if (!animationStarted.current) {
        clearTimeout(clearTimer);
        clearTimeout(settleTimer);
      }
    };
  }, []);

  const torrentLines = generateTorrentLines(40);

  return (
    <div className={`hero-animation hero-animation--${phase}`}>
      {/* Full-bleed torrent overlay - only during animation */}
      {phase !== "settled" && (
        <div className="torrent-flood" aria-hidden="true">
          <div className="torrent-flood-label">outside · a feed</div>
          <div className="torrent-flood-inner">
            {Array.from({ length: 6 }).map((_, colIdx) => (
              <div key={colIdx} className="torrent-flood-column">
                {torrentLines.map((line, lineIdx) => (
                  <div 
                    key={lineIdx} 
                    className="torrent-flood-line"
                    style={{ animationDelay: `${(colIdx * 80) + (lineIdx * 40)}ms` }}
                  >
                    {line}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sun clearing effect */}
      {phase !== "settled" && (
        <div className="sun-clear" aria-hidden="true" />
      )}

      {/* Main content with reveal */}
      <div className="hero-content">
        {children}
      </div>
    </div>
  );
}
