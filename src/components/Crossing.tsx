"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";

import type { Day } from "@/lib/day";
import { buildSea } from "@/lib/sea";
import { seaRate, stageLayers, stageProgress } from "@/lib/stage-progress";

import "./crossing.css";

export const LINE_A = "Out there, the feeds never stop.";
export const LINE_B = "In here, I get a slow one.";

const COLUMNS = 10;
const LINES = 90;
/** Must match `.sea__text` line-height in crossing.css. */
const LINE_HEIGHT = 22;
/** Pixels per second at full rate. */
const BASE_SPEED = 46;

type SeaStyle = CSSProperties & { "--speed"?: string };

/**
 * The opening. A sea of feed fragments runs behind the whole page; a sticky
 * stage holds the thesis while scrolling parts the sea, slows it, and hands
 * over to today's ledger. Progress is scrubbed by scroll, never timed, so the
 * visitor sets the pace. Reduced motion renders everything at rest.
 */
export function Crossing({ day }: { day: Day }) {
  const stageRef = useRef<HTMLElement>(null);
  const seaRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const sea = useMemo(() => buildSea({ columns: COLUMNS, lines: LINES }), []);

  useEffect(() => {
    const stage = stageRef.current;
    const seaElement = seaRef.current;
    if (!stage || !seaElement) return;

    const applyLayers = (p: number) => {
      const layers = stageLayers(p);
      stage.style.setProperty("--p", p.toFixed(4));
      stage.style.setProperty("--line-a", layers.lineA.toFixed(3));
      stage.style.setProperty("--line-b", layers.lineB.toFixed(3));
      stage.style.setProperty("--ledger", layers.ledger.toFixed(3));
      stage.style.setProperty("--sea", layers.seaOpacity.toFixed(3));
      stage.style.setProperty("--spread", layers.spread.toFixed(3));
      return layers;
    };

    // The motion mode is written straight onto the DOM: it is a fact about the
    // visitor's preference, not React state, and flipping it must not re-render
    // sixteen columns of text.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) {
      stage.dataset.motion = "reduced";
      applyLayers(1);
      return;
    }
    stage.dataset.motion = "scroll";

    const columns = Array.from(seaElement.querySelectorAll<HTMLElement>(".sea__scroll"));
    const blockHeight = LINES * LINE_HEIGHT;

    let top = 0;
    let stageHeight = 0;
    let viewportHeight = window.innerHeight;
    let viewportWidth = window.innerWidth;
    const measure = () => {
      const rect = stage.getBoundingClientRect();
      top = rect.top + window.scrollY;
      stageHeight = stage.offsetHeight;
      viewportHeight = window.innerHeight;
      viewportWidth = window.innerWidth;
    };
    measure();

    let travelled = 0;
    let last = performance.now();
    let lastCounterAt = 0;
    let frame = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const p = stageProgress(top, stageHeight, window.scrollY, viewportHeight);
      const layers = applyLayers(p);
      travelled += dt * BASE_SPEED * seaRate(p);

      for (let i = 0; i < columns.length; i += 1) {
        const column = sea[i];
        const y = (travelled * column.speed + column.phase * blockHeight) % blockHeight;
        // The channel opens from the centre: inner columns step aside most.
        const away = Math.sign(column.spread) * (0.05 + (1 - Math.abs(column.spread)) * 0.11);
        const x = away * layers.spread * viewportWidth;
        columns[i].style.transform = `translate3d(${x.toFixed(1)}px, ${(-y).toFixed(1)}px, 0)`;
      }

      if (now - lastCounterAt > 250 && counterRef.current) {
        counterRef.current.textContent = Math.floor(travelled / LINE_HEIGHT).toLocaleString("en-US");
        lastCounterAt = now;
      }

      frame = window.requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      if (document.hidden) {
        window.cancelAnimationFrame(frame);
      } else {
        last = performance.now();
        frame = window.requestAnimationFrame(tick);
      }
    };

    const onPreference = () => {
      if (reduced.matches) {
        window.cancelAnimationFrame(frame);
        stage.dataset.motion = "reduced";
        applyLayers(1);
      }
    };

    frame = window.requestAnimationFrame(tick);
    window.addEventListener("resize", measure);
    document.addEventListener("visibilitychange", onVisibility);
    reduced.addEventListener("change", onPreference);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", onPreference);
    };
  }, [sea]);

  return (
    <section
      ref={stageRef}
      className="crossing"
      data-stage
      data-motion="scroll"
      aria-label="Opening"
    >
      <div ref={seaRef} className="sea" aria-hidden="true">
        {sea.map((column, index) => (
          <div className="sea__col" key={index} style={{ "--speed": String(column.speed) } as SeaStyle}>
            {/* The column is the clip box; only the inner scroll moves. */}
            <div className="sea__scroll">
              <div className="sea__text">{column.text}</div>
              <div className="sea__text">{column.text}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="crossing__stage">
        <div className="crossing__pool" aria-hidden="true" />

        <div className="crossing__copy">
          <Image
            className="crossing__vessel"
            src="/brand/ocean-vessel.png"
            alt=""
            width={210}
            height={210}
            priority
          />

          <div className="crossing__lines">
            <h1 className="crossing__line crossing__line--a">{LINE_A}</h1>
            <p className="crossing__line crossing__line--b">{LINE_B}</p>
            <div className="crossing__line crossing__line--ledger">
              <span className="crossing__weekday">{day.weekday}</span>
              <span className="crossing__cue">
                today&apos;s page · kept in public · nothing sent
              </span>
              <span className="crossing__arrow" aria-hidden="true">
                ↓
              </span>
            </div>
          </div>

          <p className="crossing__counter">
            <span ref={counterRef}>0</span> lines of feed have gone by since you arrived
          </p>
        </div>

        <p className="crossing__scroll" aria-hidden="true">
          scroll
        </p>
      </div>
    </section>
  );
}
