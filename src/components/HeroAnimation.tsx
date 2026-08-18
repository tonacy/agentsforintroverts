"use client";

import { useState, useEffect, useRef } from "react";

const torrentPhrases = ["reply", "intro", "ask", "mention", "thread", "invite"];

function generateTorrentLines(count: number): string[] {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const phrase = torrentPhrases[i % torrentPhrases.length];
    lines.push(`example ${phrase}`);
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

    const clearTimer = setTimeout(() => {
      setPhase("clearing");
    }, 400);

    const settleTimer = setTimeout(() => {
      setPhase("settled");
    }, 2200);

    return () => {
      clearTimeout(clearTimer);
      clearTimeout(settleTimer);
    };
  }, []);

  const torrentLines = generateTorrentLines(80);

  return (
    <div className={`hero-animation hero-animation--${phase}`}>
      {/* Full-bleed torrent overlay - only during animation */}
      {phase !== "settled" && (
        <div className="torrent-flood" aria-hidden="true">
          <div className="torrent-flood-inner">
            {Array.from({ length: 12 }).map((_, colIdx) => (
              <div key={colIdx} className="torrent-flood-column">
                {torrentLines.map((line, lineIdx) => (
                  <div key={lineIdx} className="torrent-flood-line">
                    <span className="torrent-flood-dim">example</span>{" "}
                    <span className="torrent-flood-text">{line.replace("example ", "")}</span>
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
