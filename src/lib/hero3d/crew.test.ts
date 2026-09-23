import { describe, expect, it } from "vitest";

import { BOARDS, LOOSE_PAGES } from "../passage";
import { ASSEMBLY, READING_ORDER, SECTIONS, advanceTask, crewAt, planCrew, printPlacement, slotFor } from "./crew";
import { PX, deskPlacements } from "./director";

describe("the crew's clock", () => {
  const window = [0.4, 0.6] as const;

  it("waits for its moment, then plays in real time", () => {
    expect(advanceTask(0, 1 / 60, 0.3, window, 6)).toBe(0);
    let clock = 0;
    for (let i = 0; i < 60; i += 1) clock = advanceTask(clock, 1 / 60, 0.4, window, 6);
    expect(clock).toBeCloseTo(1, 5);
  });

  it("never falls behind the scroll", () => {
    const clock = advanceTask(0.2, 1 / 60, 0.5, window, 6);
    expect(clock).toBeCloseTo(3, 5);
    expect(advanceTask(0, 1 / 60, 0.6, window, 6)).toBe(6);
  });

  it("holds once done, and rewinds when the visitor scrolls back before it", () => {
    expect(advanceTask(6, 1 / 60, 0.45, window, 6)).toBe(6);
    let clock = 6;
    for (let i = 0; i < 600; i += 1) clock = advanceTask(clock, 1 / 60, 0.39, window, 6);
    expect(clock).toBe(0);
  });
});

describe.each(["wide", "narrow"] as const)("the crew on the %s desk", (kind) => {
  const crew = planCrew(kind);
  const board = BOARDS[kind];
  const rest = deskPlacements(kind);
  const print = printPlacement(kind);
  const halfW = (board.width * PX) / 2;
  const halfH = (board.height * PX) / 2;
  const times = Array.from({ length: Math.ceil(crew.duration * 60) + 1 }, (_, i) => Math.min(crew.duration, i / 60));
  const firstLift = (page: (typeof LOOSE_PAGES)[number]) => times.find((t) => crewAt(crew, t, t).pages[page]?.lifted)!;

  it("sets the piece where the flat desk sets it", () => {
    expect(print.w).toBeCloseTo(board.page.w * PX);
    expect(print.h).toBeCloseTo(board.page.h * PX);
    expect(print.x).toBeCloseTo((board.page.x + board.page.w / 2 - board.width / 2) * PX);
    for (const page of LOOSE_PAGES) {
      const slot = slotFor(print, page);
      expect(Math.abs(slot.x - print.x)).toBeLessThan(print.w / 2);
      expect(Math.abs(slot.z - print.z)).toBeLessThan(print.h / 2);
      const [left, top, right, bottom] = SECTIONS[page];
      expect(0 <= left && left < right && right <= 1 && 0 <= top && top < bottom && bottom <= 1).toBe(true);
    }
  });

  it("comes in from beyond the desk", () => {
    const start = crewAt(crew, 0, 0);
    for (const bot of start.bots) {
      expect(Math.abs(bot.x) > halfW + 0.5 || Math.abs(bot.z) > halfH + 0.5).toBe(true);
    }
    expect(Object.values(start.pages).every((page) => page === null)).toBe(true);
    expect(start.print).toBe(0);
  });

  it("fetches each page from where it landed", () => {
    for (const page of LOOSE_PAGES) {
      const t = firstLift(page);
      expect(t).toBeDefined();
      const frame = crewAt(crew, t, t);
      const held = frame.pages[page]!;
      expect(held.x).toBeCloseTo(rest[page].x, 1);
      expect(held.z).toBeCloseTo(rest[page].z, 1);
      const bot = frame.bots[crew.bots.findIndex((b) => b.page === page)];
      expect(Math.hypot(bot.x - rest[page].x, bot.z - rest[page].z)).toBeLessThan(0.1);
      expect(bot.grip).toBeGreaterThan(0.9);
    }
  });

  it("sets each page into its own section, one after another", () => {
    const placed = crew.bots.map((b) => b.release).sort((a, b) => a - b);
    placed.slice(1).forEach((t, i) => expect(t - placed[i]).toBeGreaterThan(0.45));
    expect(new Set(crew.bots.map((b) => b.page))).toEqual(new Set(READING_ORDER));
    for (const page of READING_ORDER) {
      const at = crew.bots.find((b) => b.page === page)!.release;
      const held = crewAt(crew, at, at).pages[page]!;
      const slot = slotFor(print, page);
      expect(held.x).toBeCloseTo(slot.x, 2);
      expect(held.z).toBeCloseTo(slot.z, 2);
      expect(held.y).toBeLessThan(0.05);
      expect(Math.abs(held.yaw)).toBeLessThan(0.01);
    }
  });

  it("finishes the piece, and nothing is left loose", () => {
    const done = crewAt(crew, crew.duration, crew.duration);
    expect(done.print).toBe(1);
    for (const page of LOOSE_PAGES) {
      expect(done.sections[page]).toBe(1);
      expect(done.pages[page]!.opacity).toBe(0);
    }
    for (const bot of done.bots) expect(bot.grip).toBe(0);
  });

  it("flies off once its page is set, leaving the piece for you", () => {
    const done = crewAt(crew, crew.duration, crew.duration + 9);
    for (const bot of done.bots) {
      expect(Math.abs(bot.x) > halfW + 0.5 || Math.abs(bot.z) > halfH + 0.5).toBe(true);
      expect(bot.visible).toBe(false);
    }
  });

  it("flies smoothly, at a believable pace, and never into another robot", () => {
    let previous = crewAt(crew, 0, 0);
    let closest = Infinity;
    for (const t of times.slice(1)) {
      const frame = crewAt(crew, t, t);
      frame.bots.forEach((bot, i) => {
        const was = previous.bots[i];
        expect(Math.hypot(bot.x - was.x, bot.y - was.y, bot.z - was.z)).toBeLessThan(0.11);
        if (!bot.visible) return;
        for (const other of frame.bots.slice(i + 1)) {
          if (other.visible) closest = Math.min(closest, Math.hypot(bot.x - other.x, bot.y - other.y, bot.z - other.z));
        }
      });
      for (const page of LOOSE_PAGES) {
        const now = frame.pages[page];
        const was = previous.pages[page];
        if (now && was) expect(Math.hypot(now.x - was.x, now.y - was.y, now.z - was.z)).toBeLessThan(0.11);
      }
      previous = frame;
    }
    expect(closest).toBeGreaterThan(0.7);
  });

  it("never passes a page through another robot", () => {
    for (const t of times) {
      const frame = crewAt(crew, t, t);
      for (const page of LOOSE_PAGES) {
        const held = frame.pages[page];
        if (!held?.lifted) continue;
        frame.bots.forEach((bot, i) => {
          if (crew.bots[i].page === page || !bot.visible) return;
          // Over or under the page's footprint, turned as it is, with a robot's width to spare.
          const dx = bot.x - held.x;
          const dz = bot.z - held.z;
          const along = dx * Math.cos(held.yaw) - dz * Math.sin(held.yaw);
          const across = dx * Math.sin(held.yaw) + dz * Math.cos(held.yaw);
          if (Math.abs(along) < rest[page].w / 2 + 0.35 && Math.abs(across) < rest[page].h / 2 + 0.35) {
            expect(Math.abs(bot.y - held.y)).toBeGreaterThan(0.33);
          }
        });
      }
    }
  });

  it("carries pages above the desk, never through it", () => {
    for (const t of times) {
      const frame = crewAt(crew, t, t);
      for (const bot of frame.bots) expect(bot.y).toBeGreaterThan(0.3);
      for (const page of LOOSE_PAGES) {
        const held = frame.pages[page];
        if (held) expect(held.y).toBeGreaterThanOrEqual(0.012);
      }
    }
  });

  it("does its work while the visitor reads that it does", () => {
    expect(ASSEMBLY[0]).toBeGreaterThan(0.39);
    expect(ASSEMBLY[1]).toBeLessThanOrEqual(0.62);
  });
});
