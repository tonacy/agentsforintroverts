"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";

import { buildSea, seaWake } from "@/lib/sea";
import { stageProgress } from "@/lib/stage-progress";
import {
  ARRIVAL_WIDTH,
  BOARDS,
  CARD_SIZE,
  LOOSE_PAGES,
  PAGE_SIZE,
  POST_SIZE,
  boardFit,
  boardKindFor,
  passageAt,
  posesAt,
  type BoardKind,
  type PassageFrame,
  type Pose,
} from "@/lib/passage";
import { createContourRenderer, type ContourRenderer } from "@/lib/contour-shader";
import type { Hero3D } from "@/lib/hero3d/scene";
import { Board } from "./Board";
import { ContourSea } from "./ContourSea";

import "./crossing.css";

export const LINE_A = "Most good work never makes it out there.";
export const LINE_B = "Not because it isn’t good. Because publishing is a second job.";

/**
 * The rest of the story, told over the desk as the page takes shape. Each
 * step says who does it: the person's part is the small part.
 */
export const STEPS = [
  {
    key: "bring",
    who: "you",
    title: "Just bring what you’re making.",
    detail: "A voice note, a commit, a sketch, a half-thought. Nothing has to be finished.",
  },
  {
    key: "shape",
    who: "your agents",
    title: "They do the publishing work.",
    detail: "They find what’s worth sharing, write it up in your voice, make a version for each place, and keep every source.",
  },
  {
    key: "mark",
    who: "you",
    title: "Your part: read it and sign.",
    detail: "Nothing goes out without your mark.",
  },
  {
    key: "travel",
    who: "your agents",
    title: "It goes where its people are.",
    detail: "An essay, a post, a card, each one ready to post.",
  },
] as const;

/** Where the story lands: the people it was for, answering. */
const FINALE_LEAD = "Not more followers.";
const FINALE_REST = "The two or three who get it.";
export const FINALE = `${FINALE_LEAD} ${FINALE_REST}`;

const COLUMNS = 10;
/** A farther, slower layer of the same feed, for depth. */
const FAR_COLUMNS = 16;
const LINES = 90;
/** Must match `.sea__text` line-height in crossing.css. */
const LINE_HEIGHT = 22;
/** Must match `.sea--far .sea__text` line-height in crossing.css. */
const FAR_LINE_HEIGHT = 16;
/** Pixels per second at full rate. */
const BASE_SPEED = 46;

type SeaStyle = CSSProperties & { "--speed"?: string };

const SIZES = {
  voice: { w: 270, h: 128 },
  commit: { w: 340, h: 74 },
  sketch: { w: 230, h: 180 },
  note: { w: 200, h: 170 },
  link: { w: 260, h: 150 },
} as const;

function place(element: HTMLElement | null, pose: Pose, size: { w: number; h: number }) {
  if (!element) return;
  const x = pose.cx - size.w / 2;
  const y = pose.cy - size.h / 2;
  element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${pose.r.toFixed(2)}deg) scale(${pose.s.toFixed(4)})`;
  element.style.opacity = pose.o.toFixed(3);
  element.style.visibility = pose.o <= 0.001 ? "hidden" : "visible";
}

/**
 * The opening. A sea of feed fragments runs behind the whole page; a sticky
 * stage holds the story while scrolling parts the sea, slows it, and lets a
 * day's loose pages become one piece that carries your mark out to the people
 * it was for. Progress is scrubbed by scroll, never timed, so the visitor sets the
 * pace. Reduced motion, or no script, shows the whole story at rest.
 */
export function Crossing() {
  const stageRef = useRef<HTMLElement>(null);
  const seaRef = useRef<HTMLDivElement>(null);
  const farRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sea = useMemo(() => buildSea({ columns: COLUMNS, lines: LINES }), []);
  const far = useMemo(() => buildSea({ columns: FAR_COLUMNS, lines: LINES, seed: 4099 }), []);

  useEffect(() => {
    const stage = stageRef.current;
    const seaElement = seaRef.current;
    if (!stage || !seaElement) return;

    const find = (name: string) => stage.querySelector<HTMLElement>(`[data-obj="${name}"]`);
    const objects = {
      loose: LOOSE_PAGES.map((name) => find(name)),
      page: find("page"),
      notes: [0, 1, 2, 3].map((i) => find(`note-${i}`)),
      post: find("post"),
      card: find("card"),
      labels: [0, 1, 2].map((i) => find(`label-${i}`)),
      arrivals: [0, 1, 2].map((i) => find(`arrival-${i}`)),
      signature: find("signature"),
      chop: find("chop"),
      parts: Array.from(stage.querySelectorAll<HTMLElement>("[data-part]")),
    };

    let kind: BoardKind = "wide";

    const applyFrame = (frame: PassageFrame, flatDesk = true) => {
      const lines = frame.lines;
      stage.style.setProperty("--line-a", lines.feed.toFixed(3));
      stage.style.setProperty("--line-b", lines.slow.toFixed(3));
      stage.style.setProperty("--step-bring", lines.bring.toFixed(3));
      stage.style.setProperty("--step-shape", lines.shape.toFixed(3));
      stage.style.setProperty("--step-mark", lines.mark.toFixed(3));
      stage.style.setProperty("--step-travel", lines.travel.toFixed(3));
      stage.style.setProperty("--step-answer", lines.answer.toFixed(3));
      stage.style.setProperty("--sea", frame.sea.opacity.toFixed(3));
      stage.style.setProperty("--spread", frame.sea.spread.toFixed(3));
      if (!flatDesk) return;

      const poses = posesAt(frame, kind);
      LOOSE_PAGES.forEach((name, i) => place(objects.loose[i], poses.loose[name], SIZES[name]));
      place(objects.page, poses.page, PAGE_SIZE);
      place(objects.post, poses.post, POST_SIZE);
      place(objects.card, poses.card, CARD_SIZE);
      const note = BOARDS[kind].notes[0];
      poses.notes.forEach((pose, i) => place(objects.notes[i], pose, { w: note.w, h: note.h }));
      poses.labels.forEach((pose, i) => place(objects.labels[i], pose, { w: 220, h: 24 }));
      poses.arrivals.forEach((pose, i) => place(objects.arrivals[i], pose, { w: ARRIVAL_WIDTH, h: 26 }));

      const part = frame.page;
      for (const element of objects.parts) {
        const value = part[element.dataset.part as keyof typeof part] ?? 1;
        element.style.opacity = value.toFixed(3);
        element.style.transform = `translateY(${(6 * (1 - value)).toFixed(2)}px)`;
      }
      objects.signature?.style.setProperty("stroke-dashoffset", (1 - frame.signature).toFixed(3));
      if (objects.chop) {
        const c = frame.chop;
        objects.chop.style.opacity = c > 0 ? "1" : "0";
        objects.chop.style.transform = `rotate(-8deg) scale(${(1 + 0.9 * (1 - c) * (1 - c)).toFixed(3)})`;
      }
    };

    // The motion mode is written straight onto the DOM: it is a fact about the
    // visitor's preference, not React state, and flipping it must not re-render
    // the sea or the desk.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const columns = Array.from(seaElement.querySelectorAll<HTMLElement>(".sea__scroll"));
    const farColumns = Array.from(farRef.current?.querySelectorAll<HTMLElement>(".sea__scroll") ?? []);
    const blockHeight = LINES * LINE_HEIGHT;
    const farBlockHeight = LINES * FAR_LINE_HEIGHT;
    // Each column keeps its own place so a pointer can slow some and not others.
    const offsets = sea.map(() => 0);
    let centres = sea.map((_, i) => (i + 0.5) / COLUMNS);
    let pointerTarget: number | null = null;
    let pointerX: number | null = null;
    let presence = 0;
    // The 3D opening is opt-in while it is being built: `?hero=3d`.
    const wants3D = new URLSearchParams(window.location.search).get("hero") === "3d";
    let hero: Hero3D | null = null;
    let heroLoading = false;
    let disposed = false;
    let contours: ContourRenderer | null = null;
    let shaderTime = 0;
    let lastShaderAt = -Infinity;
    let stageVisible = true;

    let top = 0;
    let stageHeight = 0;
    let viewportHeight = window.innerHeight;
    let viewportWidth = window.innerWidth;
    let lastProgress = -1;
    const measure = () => {
      const rect = stage.getBoundingClientRect();
      top = rect.top + window.scrollY;
      stageHeight = stage.offsetHeight;
      viewportHeight = window.innerHeight;
      viewportWidth = window.innerWidth;
      centres = columns.map((scroll, i) => {
        const column = scroll.parentElement;
        if (!column || column.offsetWidth === 0) return (i + 0.5) / COLUMNS;
        return (column.offsetLeft + column.offsetWidth / 2) / Math.max(1, viewportWidth);
      });
      kind = boardKindFor(viewportWidth, viewportHeight);
      hero?.resize();
      stage.dataset.board = kind;
      stage.style.setProperty("--fit", boardFit(kind, viewportWidth, viewportHeight).toFixed(4));
      stage.style.setProperty("--board-w", `${BOARDS[kind].width}px`);
      stage.style.setProperty("--board-h", `${BOARDS[kind].height}px`);
      contours?.resize(viewportWidth, viewportHeight);
      lastShaderAt = -Infinity;
      lastProgress = -1;
    };
    measure();

    let travelled = 0;
    let last = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      frame = 0;
      if (document.hidden || reduced.matches) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const p = stageProgress(top, stageHeight, window.scrollY, viewportHeight);
      const current = passageAt(p);
      if (Math.abs(p - lastProgress) > 0.00005) {
        applyFrame(current, hero === null);
        lastProgress = p;
      }
      if (hero) {
        // The scene draws the sea and the desk; only the words stay in the page.
        if (stageVisible) hero.frame(now, p);
        frame = window.requestAnimationFrame(tick);
        return;
      }
      travelled += dt * BASE_SPEED * current.sea.rate;
      shaderTime += dt * current.sea.rate;

      // Share the sea's clock. The GPU draws at most 30fps and only while the
      // channel is still opening; after that the contours have hushed.
      const opening = Math.min(1, p / 0.34);
      if (stageVisible && opening < 1 && now - lastShaderAt >= 1000 / 30) {
        contours?.draw(shaderTime, opening);
        lastShaderAt = now;
      }

      // The pointer's wake: it eases in, follows, and fades when the pointer leaves.
      const ease = 1 - Math.exp(-dt * 7);
      presence += ((pointerTarget === null ? 0 : 1) - presence) * ease;
      if (pointerTarget !== null) pointerX = pointerX === null ? pointerTarget : pointerX + (pointerTarget - pointerX) * ease;
      const wakeStrength = presence * (1 - current.sea.spread);

      for (let i = 0; i < columns.length; i += 1) {
        const column = sea[i];
        const wake = seaWake(centres[i], pointerX, wakeStrength);
        offsets[i] += dt * BASE_SPEED * current.sea.rate * column.speed * wake.slow;
        const y = (offsets[i] + column.phase * blockHeight) % blockHeight;
        // The channel opens from the centre: inner columns step aside most.
        const away = Math.sign(column.spread) * (0.05 + (1 - Math.abs(column.spread)) * 0.11);
        const x = away * current.sea.spread * viewportWidth + wake.shift;
        // The column moves sideways as a whole; only its text scrolls inside the clip.
        if (columns[i].parentElement) columns[i].parentElement!.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
        columns[i].style.transform = `translate3d(0, ${(-y).toFixed(1)}px, 0)`;
      }
      for (let i = 0; i < farColumns.length; i += 1) {
        const column = far[i];
        const y = (travelled * 0.45 * column.speed + column.phase * farBlockHeight) % farBlockHeight;
        const away = Math.sign(column.spread) * (0.03 + (1 - Math.abs(column.spread)) * 0.06);
        if (farColumns[i].parentElement) farColumns[i].parentElement!.style.transform = `translate3d(${(away * current.sea.spread * viewportWidth).toFixed(1)}px, 0, 0)`;
        farColumns[i].style.transform = `translate3d(0, ${(-y).toFixed(1)}px, 0)`;
      }

      frame = window.requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      if (document.hidden || reduced.matches) return;
      last = performance.now();
      frame = window.requestAnimationFrame(tick);
    };

    const clearInline = () => {
      for (const element of stage.querySelectorAll<HTMLElement>("[data-obj], [data-part]")) {
        element.style.removeProperty("transform");
        element.style.removeProperty("opacity");
        element.style.removeProperty("visibility");
      }
      objects.signature?.style.removeProperty("stroke-dashoffset");
    };

    const onPreference = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      if (reduced.matches) {
        stage.dataset.motion = "reduced";
        stopHero();
        clearInline();
        // Every line of the story stays visible when the scroll sequence is removed.
        for (const name of ["--line-a", "--line-b", "--step-bring", "--step-shape", "--step-mark", "--step-travel", "--step-answer"]) {
          stage.style.setProperty(name, "1");
        }
        stage.style.setProperty("--spread", "1");
        stage.style.setProperty("--sea", "0.35");
        contours?.dispose();
        contours = null;
      } else {
        stage.dataset.motion = "scroll";
        void startHero();
        if (!contours && canvasRef.current) contours = createContourRenderer(canvasRef.current);
        measure();
        applyFrame(passageAt(stageProgress(top, stageHeight, window.scrollY, viewportHeight)));
        onVisibility();
      }
    };

    const onPointer = (event: PointerEvent) => {
      const mouse = event.pointerType === "mouse";
      pointerTarget = mouse ? event.clientX / Math.max(1, viewportWidth) : null;
      hero?.pointer(mouse ? event.clientX : null, mouse ? event.clientY : null);
    };
    const onLeave = () => {
      pointerTarget = null;
      hero?.pointer(null, null);
    };

    let lease: { hero: Promise<Hero3D | null>; release(): void } | null = null;
    const startHero = async () => {
      if (!wants3D || lease || heroLoading || reduced.matches || !heroRef.current) return;
      heroLoading = true;
      try {
        const { acquireHero3D } = await import("@/lib/hero3d/scene");
        if (disposed || reduced.matches || lease || !heroRef.current) return;
        lease = acquireHero3D(heroRef.current);
        const created = await lease.hero;
        if (disposed || reduced.matches || !lease) return;
        if (!created) {
          stage.dataset.hero = "flat";
          return;
        }
        hero = created;
        stage.dataset.hero = "3d";
      } catch {
        if (!disposed) stage.dataset.hero = "flat";
      } finally {
        heroLoading = false;
      }
    };
    const stopHero = () => {
      hero = null;
      lease?.release();
      lease = null;
      if (wants3D) delete stage.dataset.hero;
    };

    const observer = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([entry]) => { stageVisible = entry.isIntersecting; })
      : null;
    observer?.observe(stage);
    onPreference();
    window.addEventListener("resize", measure);
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    reduced.addEventListener("change", onPreference);

    return () => {
      disposed = true;
      stopHero();
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("pointermove", onPointer);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", onPreference);
      observer?.disconnect();
      contours?.dispose();
    };
  }, [sea, far]);

  return (
    <section
      ref={stageRef}
      className="crossing"
      data-stage
      data-motion="reduced"
      data-board="wide"
      aria-label="Opening"
    >
      <canvas ref={heroRef} className="hero3d" aria-hidden="true" />
      <ContourSea canvasRef={canvasRef} />
      <div ref={farRef} className="sea sea--far" aria-hidden="true">
        {far.map((column, index) => (
          <div className="sea__col" key={index}>
            <div className="sea__scroll">
              <div className="sea__text">{column.text}</div>
              <div className="sea__text">{column.text}</div>
            </div>
          </div>
        ))}
      </div>
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
            src="/brand/drifting-page-mark.png"
            alt=""
            width={210}
            height={210}
            priority
          />
          <div className="crossing__lines">
            <h1 className="crossing__line crossing__line--a">{LINE_A}</h1>
            <p className="crossing__line crossing__line--b">{LINE_B}</p>
          </div>
        </div>

        <ol className="crossing__steps">
          {STEPS.map((step, i) => (
            <li className="crossing__step" data-step={step.key} data-who={step.who === "you" ? "you" : "agents"} key={step.key}>
              <span className="crossing__step-n">
                {String(i + 1).padStart(2, "0")} · {step.who}
              </span>
              <p className="crossing__step-title">{step.title}</p>
              <p className="crossing__step-detail">{step.detail}</p>
            </li>
          ))}
        </ol>
        <p className="crossing__finale">
          {FINALE_LEAD}{" "}
          <br />
          {FINALE_REST}
        </p>

        <Board />

        <a className="crossing__skip" href="#the-piece">
          Skip ahead <span aria-hidden="true">↓</span>
        </a>
        <p className="crossing__scroll" aria-hidden="true">
          scroll
        </p>
      </div>
    </section>
  );
}
