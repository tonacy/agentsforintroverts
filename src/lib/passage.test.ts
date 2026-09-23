import { describe, expect, it } from "vitest";
import { ARRIVAL_WIDTH, BOARDS, LOOSE_PAGES, passageAt, posesAt, boardFit, type BoardKind } from "./passage";

const samples = Array.from({ length: 401 }, (_, i) => i / 400);

describe("passageAt: the beat sheet", () => {
  it("opens on the feed at full speed, with only the first line showing", () => {
    const f = passageAt(0);
    expect(f.lines.feed).toBe(1);
    expect(f.lines.slow + f.lines.bring + f.lines.shape + f.lines.mark + f.lines.travel + f.lines.answer).toBe(0);
    expect(f.sea.rate).toBe(1);
    expect(f.sea.spread).toBe(0);
  });

  it("ends on the people who answer, once the forms have travelled", () => {
    expect(passageAt(0.86).lines.answer).toBe(0);
    expect(passageAt(1).lines.answer).toBe(1);
    expect(passageAt(1).lines.travel).toBe(0);
    expect(passageAt(1).arrivals).toBe(1);
  });

  it("never shows two lines at full strength at once, and always shows one", () => {
    for (const p of samples) {
      const values = Object.values(passageAt(p).lines);
      expect(values.filter((v) => v >= 0.99).length).toBeLessThanOrEqual(1);
      expect(Math.max(...values)).toBeGreaterThan(0.3);
    }
  });

  it("tells the story in order", () => {
    const peak = (key: keyof ReturnType<typeof passageAt>["lines"]) =>
      samples.find((p) => passageAt(p).lines[key] >= 0.99) ?? 2;
    const order = (["feed", "slow", "bring", "shape", "mark", "travel", "answer"] as const).map(peak);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(order.every((p) => p <= 1)).toBe(true);
  });

  it("slows the sea but never stops it, and lets the world move again at the end", () => {
    for (const p of samples) expect(passageAt(p).sea.rate).toBeGreaterThan(0);
    expect(passageAt(0.5).sea.rate).toBeLessThan(0.15);
    expect(passageAt(1).sea.rate).toBeGreaterThan(passageAt(0.5).sea.rate);
    expect(passageAt(0.5).sea.spread).toBe(1);
    expect(passageAt(1).sea.spread).toBeLessThan(1);
    expect(passageAt(1).sea.spread).toBeGreaterThan(0.4);
  });

  it("lands every loose page before any of them is gathered into the piece", () => {
    const landed = samples.find((p) => passageAt(p).loose.every((l) => l.drop === 1))!;
    const gathering = samples.find((p) => passageAt(p).loose.some((l) => l.merge > 0))!;
    expect(landed).toBeLessThan(gathering);
    expect(passageAt(0.2).loose.every((l) => l.drop === 0)).toBe(true);
    expect(passageAt(0.7).loose.every((l) => l.merge === 1)).toBe(true);
  });

  it("sets the page before it is signed, and signs it before it travels", () => {
    const first = (test: (p: number) => boolean) => samples.find(test) ?? 2;
    const set = first((p) => passageAt(p).page.body === 1);
    const signing = first((p) => passageAt(p).signature > 0);
    const signed = first((p) => passageAt(p).signature === 1);
    const stamped = first((p) => passageAt(p).chop === 1);
    const split = first((p) => passageAt(p).forms.split > 0);
    const travel = first((p) => passageAt(p).forms.travel > 0);
    expect(set).toBeLessThanOrEqual(signing);
    expect(signed).toBeLessThanOrEqual(first((p) => passageAt(p).chop > 0));
    expect(stamped).toBeLessThanOrEqual(split);
    expect(passageAt(travel).forms.split).toBe(1);
    expect(passageAt(1).forms.travel).toBe(1);
  });

  it("lets each form land in the feed only once it has travelled", () => {
    expect(passageAt(0.85).arrivals).toBe(0);
    expect(passageAt(1).arrivals).toBe(1);
  });

  it("keeps the agent's margin notes only while the piece is being set and signed", () => {
    expect(passageAt(0.3).page.notes).toBe(0);
    expect(passageAt(0.7).page.notes).toBe(1);
    expect(passageAt(1).page.notes).toBe(0);
  });

  it("clamps out-of-range progress", () => {
    expect(passageAt(-1)).toEqual(passageAt(0));
    expect(passageAt(2)).toEqual(passageAt(1));
  });
});

describe("boards", () => {
  it.each(["wide", "narrow"] as BoardKind[])("keeps every %s object on the board", (kind) => {
    const board = BOARDS[kind];
    const inside = (r: { x: number; y: number; w: number; h: number }) =>
      r.x >= 0 && r.y >= 0 && r.x + r.w <= board.width && r.y + r.h <= board.height;
    expect(inside(board.page)).toBe(true);
    for (const name of LOOSE_PAGES) expect(inside(board.loose[name])).toBe(true);
    for (const form of board.forms) expect(inside(form)).toBe(true);
    expect(Math.abs(board.page.x + board.page.w / 2 - board.width / 2)).toBeLessThan(1);
  });

  it("fits the board to the viewport without upscaling past its design size", () => {
    expect(boardFit("wide", 1440, 900)).toBeGreaterThan(0.7);
    expect(boardFit("wide", 1440, 900)).toBeLessThanOrEqual(1);
    expect(boardFit("wide", 3000, 2000)).toBe(1);
    const phone = boardFit("narrow", 390, 844);
    expect(phone).toBeGreaterThan(0.45);
    expect(BOARDS.narrow.width * phone).toBeLessThanOrEqual(390 - 24);
  });
});

describe("posesAt", () => {
  it("keeps the desk empty until the work arrives", () => {
    const poses = posesAt(passageAt(0.1), "wide");
    for (const name of LOOSE_PAGES) expect(poses.loose[name].o).toBe(0);
    expect(poses.page.o).toBe(0);
    expect(poses.post.o).toBe(0);
    expect(poses.card.o).toBe(0);
  });

  it("rests each loose page where the board puts it", () => {
    const poses = posesAt(passageAt(0.45), "wide");
    for (const name of LOOSE_PAGES) {
      const rest = BOARDS.wide.loose[name];
      expect(poses.loose[name].o).toBe(1);
      expect(poses.loose[name].cx).toBeCloseTo(rest.x + rest.w / 2);
      expect(poses.loose[name].cy).toBeCloseTo(rest.y + rest.h / 2);
    }
  });

  it("gathers the fragments into the page, which holds the centre until it splits", () => {
    const poses = posesAt(passageAt(0.72), "narrow");
    for (const name of LOOSE_PAGES) expect(poses.loose[name].o).toBe(0);
    const page = BOARDS.narrow.page;
    expect(poses.page.o).toBe(1);
    expect(poses.page.cx).toBeCloseTo(page.x + page.w / 2);
    expect(poses.post.o).toBe(0);
  });

  it("sets each arrival beside the form that travelled there", () => {
    const poses = posesAt(passageAt(1), "wide");
    const forms = [poses.page, poses.post, poses.card];
    poses.arrivals.forEach((arrival, i) => {
      expect(arrival.o).toBe(1);
      expect(Math.hypot(arrival.cx - forms[i].cx, arrival.cy - forms[i].cy)).toBeLessThan(140);
    });
  });

  it.each(["wide", "narrow"] as BoardKind[])("keeps every arrival line on the %s desk", (kind) => {
    const board = BOARDS[kind];
    for (const arrival of posesAt(passageAt(1), kind).arrivals) {
      expect(arrival.cx - ARRIVAL_WIDTH / 2).toBeGreaterThanOrEqual(0);
      expect(arrival.cx + ARRIVAL_WIDTH / 2).toBeLessThanOrEqual(board.width);
    }
  });

  it("sends every form out toward the sea, small but still in sight, by the end", () => {
    const board = BOARDS.wide;
    const poses = posesAt(passageAt(1), "wide");
    for (const pose of [poses.page, poses.post, poses.card]) {
      expect(pose.o).toBeGreaterThan(0.5);
      expect(pose.s).toBeLessThan(0.35);
      const fromCentre = Math.hypot(pose.cx - board.width / 2, pose.cy - board.height / 2);
      expect(fromCentre).toBeGreaterThan(board.height * 0.3);
    }
    for (const label of poses.labels) expect(label.o).toBe(0);
  });
});
