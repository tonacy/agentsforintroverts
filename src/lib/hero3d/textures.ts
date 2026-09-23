/**
 * Canvas drawings for the 3D scene: the flotilla's paper slips, set once into
 * an atlas, and the face of each loose page, drawn in the site's own fonts so
 * a page in the scene looks like the paper on the flat desk.
 */

import { FRAGMENT_POOL } from "../sea";
import { SKETCH_ARROW, SKETCH_COLUMNS, SKETCH_PAGE, WAVE } from "../desk-art";
import type { LoosePage } from "../passage";
import { slipFor, type SlipIcon } from "./slips";

export type Fonts = { serif: string; detail: string; mono: string };

/** The site's font stacks, as next/font named them. */
export function readFonts(): Fonts {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    serif: read("--font-serif", "Georgia, serif"),
    detail: read("--font-detail", "system-ui, sans-serif"),
    mono: read("--font-mono", "ui-monospace, Menlo, monospace"),
  };
}

export async function loadFonts(fonts: Fonts): Promise<void> {
  if (!("fonts" in document)) return;
  await Promise.all(
    [
      `italic 40px ${fonts.serif}`,
      `40px ${fonts.serif}`,
      `500 40px ${fonts.detail}`,
      `40px ${fonts.mono}`,
      `500 40px ${fonts.mono}`,
    ].map((font) => document.fonts.load(font).catch(() => [])),
  );
}

// ---------- The flotilla's slips ----------

/** Each slip's face is a cell in one atlas, drawn at this many canvas pixels. */
export const SLIP_CELL = { w: 512, h: 192 };
export const SLIP_COLUMNS = 4;

export type SlipAtlas = { canvas: HTMLCanvasElement; columns: number; rows: number };

type Point = [number, number];

function arcPoints(cx: number, cy: number, r: number, from: number, to: number, steps = 28): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Point;
  });
}

function curve(p0: Point, p1: Point, p2: Point, p3: Point, steps = 18): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    return [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ] as Point;
  });
}

function roundedBox(x0: number, y0: number, x1: number, y1: number, r: number): Point[] {
  return [
    ...arcPoints(x1 - r, y0 + r, r, -Math.PI / 2, 0, 8),
    ...arcPoints(x1 - r, y1 - r, r, 0, Math.PI / 2, 8),
    ...arcPoints(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, 8),
    ...arcPoints(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, 8),
  ];
}

/** Strokes for each icon, in a 100-unit square: what the notice is, never whose logo. */
const ICON_STROKES: Record<SlipIcon, { lines: Point[][]; closed?: boolean[]; dots?: Point[] }> = {
  envelope: {
    lines: [roundedBox(10, 24, 90, 78, 5), [[13, 29], [50, 57], [87, 29]]],
    closed: [true, false],
  },
  calendar: {
    lines: [roundedBox(14, 22, 86, 86, 6), [[15, 40], [85, 40]], [[34, 12], [34, 29]], [[66, 12], [66, 29]]],
    closed: [true, false, false, false],
    dots: [[32, 55], [50, 55], [68, 55], [32, 71], [50, 71]],
  },
  at: {
    lines: [
      arcPoints(47, 50, 13, 0, Math.PI * 2, 24),
      [[61, 37], [61, 57], ...curve([61, 57], [62, 68], [80, 68], [81, 52]).slice(1), ...arcPoints(50, 50, 31, -0.07, -Math.PI * 2 + 0.95, 40).slice(1)],
    ],
    closed: [true, false],
  },
  chat: {
    lines: [
      // The tail drops from the bottom edge, between its right and left corners.
      (() => {
        const box = roundedBox(12, 16, 88, 68, 14);
        return [...box.slice(0, 18), [46, 68], [27, 87], [31, 68], ...box.slice(18)] as Point[];
      })(),
      [[26, 35], [72, 35]],
      [[26, 50], [56, 50]],
    ],
    closed: [true, false, false],
  },
  heart: {
    lines: [[...curve([50, 84], [16, 62], [10, 42], [20, 28]), ...curve([20, 28], [30, 14], [46, 18], [50, 34]).slice(1), ...curve([50, 34], [54, 18], [70, 14], [80, 28]).slice(1), ...curve([80, 28], [90, 42], [84, 62], [50, 84]).slice(1)]],
    closed: [true],
  },
  repost: {
    lines: [
      [[22, 60], [22, 34], [70, 34]],
      [[62, 25], [72, 34], [62, 43]],
      [[78, 40], [78, 66], [30, 66]],
      [[38, 57], [28, 66], [38, 75]],
    ],
  },
  person: {
    lines: [arcPoints(46, 36, 14, 0, Math.PI * 2, 24), [...curve([18, 86], [18, 64], [32, 56], [46, 56]), ...curve([46, 56], [60, 56], [74, 64], [74, 86]).slice(1)], [[82, 16], [82, 36]], [[72, 26], [92, 26]]],
    closed: [true, false, false, false],
  },
  newsletter: {
    lines: [roundedBox(18, 12, 82, 88, 3), [[28, 27], [72, 27]], [[28, 43], [72, 43]], [[28, 56], [72, 56]], [[28, 69], [58, 69]]],
    closed: [true, false, false, false, false],
  },
  bell: {
    lines: [
      [...curve([28, 70], [30, 44], [32, 24], [50, 24]), ...curve([50, 24], [68, 24], [70, 44], [72, 70]).slice(1), [80, 76], [20, 76], [28, 70]],
      [[50, 13], [50, 24]],
      arcPoints(50, 84, 5, 0, Math.PI, 10),
    ],
    closed: [false, false, false],
  },
};

/**
 * Ink a path the way a brush would: it swells in the middle of a stroke and
 * lifts at its ends, and the hand never quite follows the line.
 */
function ink(ctx: CanvasRenderingContext2D, points: Point[], closed: boolean, width: number, random: () => number) {
  const path = closed ? [...points, points[0]] : points;
  const dense: Point[] = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2.5));
    for (let s = 0; s < steps; s += 1) dense.push([ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps]);
  }
  dense.push(path[path.length - 1]);
  const drift = [random() * 6, random() * 6];
  const wobble = (i: number, k: number) => Math.sin(i * 0.21 + drift[k]) * 0.45 + Math.sin(i * 0.057 + drift[k] * 2) * 0.55;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 0; i < dense.length - 1; i += 1) {
    const t = i / (dense.length - 1);
    const pressure = closed ? 0.85 + 0.15 * Math.sin(t * Math.PI * 3 + drift[0]) : 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.04));
    ctx.lineWidth = width * pressure;
    ctx.beginPath();
    ctx.moveTo(dense[i][0] + wobble(i, 0), dense[i][1] + wobble(i, 1));
    ctx.lineTo(dense[i + 1][0] + wobble(i + 1, 0), dense[i + 1][1] + wobble(i + 1, 1));
    ctx.stroke();
  }
}

function drawIcon(ctx: CanvasRenderingContext2D, icon: SlipIcon, x: number, y: number, size: number, random: () => number) {
  const art = ICON_STROKES[icon];
  const k = size / 100;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.strokeStyle = SLIP_INK;
  ctx.fillStyle = SLIP_INK;
  art.lines.forEach((line, i) => ink(ctx, line, art.closed?.[i] ?? false, 7.2, random));
  for (const [dx, dy] of art.dots ?? []) {
    ctx.beginPath();
    ctx.arc(dx + (random() - 0.5) * 0.8, dy + (random() - 0.5) * 0.8, 4.2 + random() * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

const SLIP_INK = "#1b2a23";

/**
 * Every notice in the feed, once, as a small paper slip: a hand-inked icon for
 * what it is, the words for what it says, and the platform in small capitals.
 */
export function drawSlipAtlas(fonts: Fonts): SlipAtlas {
  const rows = Math.ceil(FRAGMENT_POOL.length / SLIP_COLUMNS);
  const canvas = document.createElement("canvas");
  canvas.width = SLIP_CELL.w * SLIP_COLUMNS;
  canvas.height = 2 ** Math.ceil(Math.log2(rows * SLIP_CELL.h));
  const ctx = canvas.getContext("2d")!;
  FRAGMENT_POOL.forEach((fragment, i) => {
    const { source, message, icon } = slipFor(fragment);
    const random = mulberry32(97 + i * 31);
    const x = (i % SLIP_COLUMNS) * SLIP_CELL.w;
    const y = Math.floor(i / SLIP_COLUMNS) * SLIP_CELL.h;
    ctx.save();
    ctx.translate(x, y);
    // The slip, cut a little by hand.
    const card = roundedBox(12, 12, SLIP_CELL.w - 12, SLIP_CELL.h - 12, 18).map(
      ([px, py]) => [px + (random() - 0.5) * 1.2, py + (random() - 0.5) * 1.2] as Point,
    );
    ctx.beginPath();
    card.forEach(([px, py], j) => (j ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    ctx.fillStyle = "#fffdf8";
    ctx.fill();
    ctx.save();
    ctx.clip();
    grain(ctx, SLIP_CELL.w, SLIP_CELL.h, 300 + i);
    ctx.restore();
    ctx.strokeStyle = SLIP_INK;
    ink(ctx, roundedBox(13, 13, SLIP_CELL.w - 13, SLIP_CELL.h - 13, 17), true, 3.6, random);

    drawIcon(ctx, icon, 34, 36, 120, random);

    // A notice's two lines: who it came from, and what it wants.
    const left = 184;
    const room = SLIP_CELL.w - left - 34;
    ctx.fillStyle = "#6f6c62";
    ctx.font = `500 23px ${fonts.mono}`;
    ctx.textBaseline = "alphabetic";
    const label = source.toUpperCase().split("").join(String.fromCharCode(8202));
    ctx.fillText(label, left, 78);
    ctx.fillStyle = SLIP_INK;
    let size = 50;
    ctx.font = `500 ${size}px ${fonts.detail}`;
    while (size > 34 && ctx.measureText(message).width > room) {
      size -= 2;
      ctx.font = `500 ${size}px ${fonts.detail}`;
    }
    if (ctx.measureText(message).width > room) {
      ctx.font = `500 34px ${fonts.detail}`;
      wrap(ctx, message, left, 116, room, 36, 2);
    } else {
      ctx.fillText(message, left, 132);
    }
    // Unread.
    ctx.fillStyle = "#0f4a38";
    ctx.beginPath();
    ctx.arc(SLIP_CELL.w - 44, 46, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  return { canvas, columns: SLIP_COLUMNS, rows };
}

// ---------- Loose pages ----------

/** Board pixels to canvas pixels: faces are drawn at four times their size. */
const S = 4;

export const PAGE_SIZES: Record<LoosePage, { w: number; h: number }> = {
  voice: { w: 270, h: 128 },
  commit: { w: 340, h: 74 },
  sketch: { w: 230, h: 180 },
  note: { w: 200, h: 170 },
  link: { w: 260, h: 150 },
};

const INK = "#18231d";
const LEAF = "#0f4a38";
const MADDER = "#a5402d";
const MUTED = "#444444";
const FAINT = "#737373";
const GRAPHITE = "#6c6b64";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const random = mulberry32(seed);
  ctx.save();
  for (let i = 0; i < (w * h) / 90; i += 1) {
    ctx.fillStyle = `rgba(90, 76, 50, ${0.02 + random() * 0.05})`;
    ctx.fillRect(random() * w, random() * h, 1.6, 1.6);
  }
  ctx.restore();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number, maxLines = 8) {
  const words = text.split(" ");
  let line = "";
  let lines = 0;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      lines += 1;
      if (lines >= maxLines) return;
      line = word;
    } else {
      line = next;
    }
  }
  if (line) ctx.fillText(line, x, y + lines * lineHeight);
}

function page(name: LoosePage): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const { w, h } = PAGE_SIZES[name];
  const canvas = document.createElement("canvas");
  canvas.width = w * S;
  canvas.height = h * S;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(S, S);
  return { canvas, ctx };
}

export function drawPage(name: LoosePage, fonts: Fonts): HTMLCanvasElement {
  const { canvas, ctx } = page(name);
  const { w, h } = PAGE_SIZES[name];
  ctx.textBaseline = "alphabetic";

  switch (name) {
    case "voice": {
      ctx.fillStyle = "#e8eddf";
      ctx.fillRect(0, 0, w, h);
      grain(ctx, w, h, 11);
      ctx.fillStyle = MADDER;
      ctx.beginPath();
      ctx.arc(19.5, 21.5, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = LEAF;
      ctx.font = `500 10px ${fonts.mono}`;
      ctx.fillText("VOICE NOTE · 0:48", 28, 25);
      const barWidth = (w - 32 - 45 * 2) / 46;
      WAVE.forEach((height, i) => {
        ctx.fillStyle = "rgba(15, 74, 56, 0.55)";
        const x = 16 + i * (barWidth + 2);
        ctx.fillRect(x, 50 - height / 2, barWidth, height);
      });
      ctx.fillStyle = INK;
      ctx.font = `italic 14.5px ${fonts.serif}`;
      wrap(ctx, "“What if the page starts fast, and slows down as you read?”", 16, 88, w - 32, 19);
      break;
    }
    case "commit": {
      ctx.fillStyle = "#fffdf8";
      ctx.fillRect(0, 0, w, h);
      grain(ctx, w, h, 23);
      ctx.fillStyle = LEAF;
      ctx.fillRect(0, 0, 4, h);
      ctx.font = `500 11.5px ${fonts.mono}`;
      ctx.fillText("a71f053", 22, 41);
      ctx.fillStyle = INK;
      ctx.font = `11.5px ${fonts.mono}`;
      wrap(ctx, "Rebuild the home page as a scroll-driven crossing over a live sea", 92, 32, w - 110, 16.5, 3);
      break;
    }
    case "sketch": {
      ctx.fillStyle = "#fbfaf5";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(120, 140, 160, 0.14)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= w; x += 14) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += 14) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.strokeStyle = GRAPHITE;
      ctx.lineWidth = 1.3;
      ctx.lineCap = "round";
      for (const column of SKETCH_COLUMNS) {
        ctx.setLineDash(column.dash);
        ctx.stroke(new Path2D(column.path));
      }
      ctx.setLineDash([]);
      ctx.fillStyle = "#fbfaf5";
      ctx.lineWidth = 1.6;
      const sheet = new Path2D(SKETCH_PAGE);
      ctx.fill(sheet);
      ctx.stroke(sheet);
      ctx.lineWidth = 1.3;
      ctx.stroke(new Path2D(SKETCH_ARROW));
      ctx.fillStyle = GRAPHITE;
      ctx.font = `italic 15px ${fonts.serif}`;
      ctx.fillText("slower here", 118, 44);
      break;
    }
    case "note": {
      ctx.fillStyle = "#eef1dc";
      ctx.fillRect(0, 0, w, h);
      grain(ctx, w, h, 37);
      ctx.save();
      ctx.translate(w / 2, 5);
      ctx.rotate((-3 * Math.PI) / 180);
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.fillRect(-37, -6, 74, 16);
      ctx.restore();
      ctx.fillStyle = INK;
      ctx.font = `italic 19px ${fonts.serif}`;
      wrap(ctx, "what if the sea parts wherever you look?", 20, 50, w - 40, 24);
      break;
    }
    case "link": {
      ctx.fillStyle = "#fffefb";
      ctx.fillRect(0, 0, w, h);
      grain(ctx, w, h, 41);
      ctx.fillStyle = "rgba(17, 17, 17, 0.025)";
      ctx.fillRect(0, 0, w, 26);
      ctx.fillStyle = "rgba(17, 17, 17, 0.08)";
      ctx.fillRect(0, 26, w, 1);
      for (const x of [13.5, 25.5, 37.5]) {
        ctx.fillStyle = "#d9d3c5";
        ctx.beginPath();
        ctx.arc(x, 13, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = FAINT;
      ctx.font = `9.5px ${fonts.mono}`;
      ctx.fillText("developer.mozilla.org", 52, 16.5);
      ctx.fillStyle = INK;
      ctx.font = `500 13px ${fonts.mono}`;
      ctx.fillText("prefers-reduced-motion", 14, 52);
      ctx.fillStyle = MUTED;
      ctx.font = `12.5px ${fonts.detail}`;
      wrap(ctx, "Detects whether a visitor has asked to minimize non-essential motion.", 14, 74, w - 28, 17.5);
      break;
    }
  }
  return canvas;
}

/**
 * A soft shadow for any page, stretched to its size. The core fills the middle
 * 55% of the square, and the falloff is smooth, so a shadow stays soft
 * however far it is scaled.
 */
export function drawShadow(): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(size, size);
  const core = 0.275;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = Math.max(0, Math.abs((x + 0.5) / size - 0.5) - core);
      const dy = Math.max(0, Math.abs((y + 0.5) / size - 0.5) - core);
      const distance = Math.hypot(dx, dy) / (0.5 - core);
      const alpha = Math.exp(-distance * distance * 5.5) * (1 - Math.min(1, distance) ** 4);
      const i = (y * size + x) * 4;
      image.data[i] = 30;
      image.data[i + 1] = 40;
      image.data[i + 2] = 32;
      image.data[i + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// ---------- The piece ----------

/** The piece is drawn at the flat desk's design size, three times over. */
export const PRINT_SIZE = { w: 400, h: 540 } as const;
const PS = 3;
const SHEET_PAPER = "#f8f4ea";

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, align: "left" | "right" = "left") {
  const width = [...text].reduce((sum, ch) => sum + ctx.measureText(ch).width + spacing, -spacing);
  let at = align === "right" ? x - width : x;
  for (const ch of text) {
    ctx.fillText(ch, at, y);
    at += ctx.measureText(ch).width + spacing;
  }
}

/**
 * Set words into lines, the first `indented` lines starting `indent` in.
 * Returns where the last line ends, for anything set after it.
 */
function setLines(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number, indent = 0, indented = 0) {
  const words = text.split(" ");
  let line = "";
  let row = 0;
  let end = { x, y };
  const room = () => width - (row < indented ? indent : 0);
  const flush = () => {
    const at = x + (row < indented ? indent : 0);
    ctx.fillText(line, at, y + row * lineHeight);
    end = { x: at + ctx.measureText(line).width, y: y + row * lineHeight };
    row += 1;
  };
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > room()) {
      flush();
      line = word;
    } else {
      line = next;
    }
  }
  if (line) flush();
  return end;
}

/**
 * The finished piece, set like the flat desk's print: the head, your title
 * and deck, the figure, two paragraphs, the kept source, and the colophon
 * with a line waiting for your signature. The scene inks each section in as
 * the crew presses its page into place; its bands are `SECTIONS` in ./crew.
 */
export function drawPrint(fonts: Fonts, figure: CanvasImageSource | null): HTMLCanvasElement {
  const { w, h } = PRINT_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = w * PS;
  canvas.height = h * PS;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(PS, PS);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = SHEET_PAPER;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(120, 100, 70, 0.2)";
  ctx.lineWidth = 1;
  ctx.strokeRect(9.5, 9.5, w - 19, h - 19);
  const left = 30;
  const width = w - 60;

  ctx.fillStyle = LEAF;
  ctx.font = `500 8.5px ${fonts.mono}`;
  spaced(ctx, "FROM THE WORKBENCH", left, 35, 1.2);
  spaced(ctx, "NO. 001", left + width, 35, 1.2, "right");

  // From your voice note: the title and the deck.
  ctx.fillStyle = INK;
  ctx.font = `360 38px ${fonts.serif}`;
  spaced(ctx, "Why this page", left, 80, -1.3);
  ctx.fillStyle = LEAF;
  ctx.font = `italic 360 38px ${fonts.serif}`;
  spaced(ctx, "slows down", left, 115, -1.3);
  ctx.fillStyle = "#3a4a40";
  ctx.font = `italic 12.5px ${fonts.serif}`;
  setLines(ctx, "It starts at the speed of a feed and settles at the speed of reading.", left, 138, width, 17);

  // From your sketch: the figure, on its plate.
  ctx.fillStyle = "#efe7d6";
  ctx.fillRect(left, 172, width, 190);
  ctx.strokeStyle = "rgba(120, 100, 70, 0.22)";
  ctx.strokeRect(left + 4.5, 176.5, width - 9, 181);
  if (figure) {
    const fh = 174;
    const fw = (fh * 16) / 9;
    ctx.drawImage(figure, left + (width - fw) / 2, 180, fw, fh);
  }

  // From your commit, and from your note: the two paragraphs.
  ctx.fillStyle = LEAF;
  ctx.font = `380 30px ${fonts.serif}`;
  ctx.fillText("I", left, 402);
  ctx.fillStyle = INK;
  ctx.font = `10px ${fonts.serif}`;
  setLines(ctx, "t opens on a sea of fragments: an email reply, a calendar ask, a mention, a thread you were added to. They stream past the way a feed does.", left, 386, width, 15, 10.5, 2);
  const end = setLines(ctx, "Scrolling parts the sea and slows it. The motion is scrubbed by scroll, never timed, so it cannot run ahead of the person reading.", left, 433, width, 15);
  ctx.fillStyle = LEAF;
  ctx.font = `7px ${fonts.mono}`;
  ctx.fillText("1", end.x + 1.5, end.y - 4);

  // From the page you had open: the source, kept.
  ctx.fillStyle = LEAF;
  ctx.font = `7px ${fonts.mono}`;
  ctx.fillText("1  Source kept: prefers-reduced-motion, developer.mozilla.org", left, 479);

  // The colophon, and a line for your signature.
  ctx.fillStyle = "rgba(120, 100, 70, 0.22)";
  ctx.fillRect(left, 491, width, 1);
  ctx.fillStyle = "#6c776d";
  ctx.font = `7.5px ${fonts.mono}`;
  ctx.fillText("Made with agents.", left, 505);
  ctx.fillText("The point of view is yours.", left, 516);
  ctx.fillStyle = "#3a4a40";
  ctx.fillRect(left + width - 150, 516, 110, 0.8);
  return canvas;
}

// ---------- The crew's faces ----------

export const FACE_MOODS = ["look", "blink", "work", "happy"] as const;
export const FACE_CELL = { w: 160, h: 96 } as const;

/** A little screen per mood, side by side: dark glass, pale eyes. */
export function drawFaces(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = FACE_CELL.w * FACE_MOODS.length;
  canvas.height = FACE_CELL.h;
  const ctx = canvas.getContext("2d")!;
  FACE_MOODS.forEach((mood, i) => {
    const x0 = i * FACE_CELL.w;
    ctx.save();
    ctx.translate(x0, 0);
    ctx.fillStyle = "#15302a";
    ctx.fillRect(0, 0, FACE_CELL.w, FACE_CELL.h);
    const glow = ctx.createRadialGradient(80, 40, 6, 80, 48, 90);
    glow.addColorStop(0, "rgba(120, 190, 150, 0.16)");
    glow.addColorStop(1, "rgba(120, 190, 150, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, FACE_CELL.w, FACE_CELL.h);
    ctx.fillStyle = "#dcefdf";
    ctx.strokeStyle = "#dcefdf";
    ctx.lineCap = "round";
    for (const ex of [52, 108]) {
      ctx.beginPath();
      if (mood === "look") {
        ctx.ellipse(ex, 46, 11, 15, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (mood === "blink") {
        ctx.lineWidth = 6;
        ctx.moveTo(ex - 11, 50);
        ctx.lineTo(ex + 11, 50);
        ctx.stroke();
      } else if (mood === "work") {
        // Eyes down on the page in hand.
        ctx.ellipse(ex, 60, 10, 12, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.lineWidth = 6;
        ctx.arc(ex, 54, 11, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }
    }
    ctx.restore();
  });
  return canvas;
}
