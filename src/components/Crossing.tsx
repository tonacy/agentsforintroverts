"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

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
import { CREW_SCREENS, storyProgress } from "@/lib/hero3d/director";
import type { Hero3D } from "@/lib/hero3d/scene";
import { Board } from "./Board";
import { Water } from "./Water";

import "./crossing.css";

export const LINE_A = "Writers have agents. Painters have galleries.";
export const LINE_B = "Most people who make good work have no one, so the work stays in the room.";

/**
 * The rest of the story, told over the desk as the page takes shape. Each
 * step says who does it: the person's part is the small part.
 */
export const STEPS = [
  {
    key: "bring",
    who: "you",
    title: "Stay at your desk.",
    detail: "Put down what you’re making as it happens: a voice note, a commit, a sketch. The thinking is already yours.",
  },
  {
    key: "shape",
    who: "your agents",
    title: "They read it the way a good agent would.",
    detail: "They find what’s worth carrying out, shape it for each place, and keep every source. If it isn’t worth sending, they say so.",
  },
  {
    key: "mark",
    who: "you",
    title: "Nothing leaves without your mark.",
    detail: "You sign one exact version. Change a word and the mark comes off.",
  },
  {
    key: "travel",
    who: "your agents",
    title: "They carry it to where its people are.",
    detail: "And they bring back who answered.",
  },
] as const;

/** Where the story lands: the people it was for, answering. */
const FINALE_LEAD = "Not the crowd.";
const FINALE_REST = "The few who’d want it.";
export const FINALE = `${FINALE_LEAD} ${FINALE_REST}`;

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
 * The opening. The page floats on still water, the feed a few notices far
 * off; a sticky stage holds the story while scrolling lets the water sink
 * away and a day's loose pages become one piece that carries your mark out to
 * the people it was for. Progress is scrubbed by scroll, never timed, so the visitor sets the
 * pace. Reduced motion, or no script, shows the whole story at rest.
 */
export function Crossing() {
  const stageRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

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
    // the desk.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    // The 3D opening is opt-in while it is being built: `?hero=3d`.
    const wants3D = new URLSearchParams(window.location.search).get("hero") === "3d";
    let hero: Hero3D | null = null;
    // Where in the scroll the crew finished, if it did so while the visitor watched.
    let finishedAt: number | null = null;
    let heroLoading = false;
    let disposed = false;
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
      kind = boardKindFor(viewportWidth, viewportHeight);
      hero?.resize();
      stage.dataset.board = kind;
      stage.style.setProperty("--fit", boardFit(kind, viewportWidth, viewportHeight).toFixed(4));
      stage.style.setProperty("--board-w", `${BOARDS[kind].width}px`);
      stage.style.setProperty("--board-h", `${BOARDS[kind].height}px`);
      lastProgress = -1;
    };
    measure();

    let frame = 0;

    const tick = (now: number) => {
      frame = 0;
      if (document.hidden || reduced.matches) return;
      const raw = stageProgress(top, stageHeight, window.scrollY, viewportHeight);
      // The 3D passage is longer than its story: the extra scroll is the crew's.
      const p = hero ? storyProgress(raw, CREW_SCREENS, finishedAt) : raw;
      const current = passageAt(p);
      if (Math.abs(p - lastProgress) > 0.00005) {
        applyFrame(current, hero === null);
        lastProgress = p;
      }
      // The 3D scene draws its own sea and desk; only the words stay in the page.
      if (hero && stageVisible) {
        if (!hero.frame(now, p)) finishedAt = null;
        else if (finishedAt === null) finishedAt = raw;
      }
      frame = window.requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      if (document.hidden || reduced.matches) return;
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
      } else {
        stage.dataset.motion = "scroll";
        void startHero();
        measure();
        applyFrame(passageAt(stageProgress(top, stageHeight, window.scrollY, viewportHeight)));
        onVisibility();
      }
    };

    const onPointer = (event: PointerEvent) => {
      const mouse = event.pointerType === "mouse";
      hero?.pointer(mouse ? event.clientX : null, mouse ? event.clientY : null);
    };
    const onLeave = () => {
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
        stage.style.setProperty("--extra-screens", String(CREW_SCREENS));
        measure();
      } catch {
        if (!disposed) stage.dataset.hero = "flat";
      } finally {
        heroLoading = false;
      }
    };
    const stopHero = () => {
      hero = null;
      finishedAt = null;
      stage.style.removeProperty("--extra-screens");
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
    };
  }, []);

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
      <div className="crossing__stage">
        <Water />

        <div className="crossing__copy">
          <span className="crossing__afloat">
            <Image
              className="crossing__vessel"
              src="/brand/drifting-page-mark.png"
              alt=""
              width={210}
              height={210}
              priority
            />
          </span>
          <div className="crossing__lines">
            <h1 className="crossing__line crossing__line--a">
              {/* Each sentence wraps as a unit, so a narrow screen never splits "Painters have galleries." */}
              {LINE_A.split(/(?<=\.) /).map((sentence, i) => (
                <span key={sentence} className="crossing__sentence">
                  {i > 0 && " "}
                  {sentence}
                </span>
              ))}
            </h1>
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
