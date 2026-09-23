/**
 * The drawn details of the loose pages, shared by the flat desk and the 3D
 * one so both show the same voice note and the same sketch.
 */

/** Deterministic bar heights for the voice note's waveform, in board pixels. */
export const WAVE = Array.from({ length: 46 }, (_, i) => {
  const v = Math.abs(Math.sin(i * 1.7) * 0.6 + Math.sin(i * 0.43) * 0.4);
  return Math.round(4 + v * 22);
});

/** The sketch's nine pencil columns, bowing where the sea parts, in a 230x180 box. */
export const SKETCH_COLUMNS = Array.from({ length: 9 }, (_, c) => {
  const x = 18 + c * 24;
  const bow = c > 3 && c < 8 ? (c - 5.5) * 7 : 0;
  return {
    path: `M${x} 14 C ${x + bow * 0.2} 60, ${x + bow} 92, ${x + bow * 0.4} 166`,
    dash: c < 3 ? [3, 3] : c < 6 ? [5, 7] : [6, 13],
  };
});

export const SKETCH_PAGE = "M142 78l32-6 5 30-32 6z";
export const SKETCH_ARROW = "M30 150 C 90 160, 150 156, 206 146 m-9 -6 l 9 6 l -10 4";
