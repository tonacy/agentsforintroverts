import type { CSSProperties } from "react";

import { slipFor, type SlipIcon } from "@/lib/hero3d/slips";
import type { FRAGMENT_POOL } from "@/lib/sea";

/** Inked stand-ins for what a notice is, never whose logo, in a 24-unit square. */
const ICONS: Partial<Record<SlipIcon, string>> = {
  envelope: "M4.5 6h15A1.5 1.5 0 0 1 21 7.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-10A1.5 1.5 0 0 1 4.5 6zM3.5 7.5 12 13.5l8.5-6",
  calendar: "M5.5 6h13A1.5 1.5 0 0 1 20 7.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6zM4 10.5h16M8.5 3.5v4M15.5 3.5v4",
  at: "M15.2 12a3.2 3.2 0 1 1-6.4 0 3.2 3.2 0 0 1 6.4 0zM15.2 9v4.2c0 2.6 4.3 2.4 4.3-1.5A7.6 7.6 0 1 0 16 18.6",
  chat: "M5 5h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 16h-7.5L7 20v-4H5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 5 5zM7.5 9h9M7.5 12h6",
  bell: "M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5zM10.5 20.5a1.8 1.8 0 0 0 3 0",
  person: "M15.3 8.5a3.3 3.3 0 1 1-6.6 0 3.3 3.3 0 0 1 6.6 0zM5 20c.6-4 3.3-6 7-6s6.4 2 7 6",
};

/** A notice, where it floats (percent of the water), how near it is, and its tilt. */
const AFLOAT: [(typeof FRAGMENT_POOL)[number], number, number, number, number][] = [
  ["X · a mention", 15, 48, 0.74, -5],
  ["calendar · a conflict", 83, 41, 0.8, 4],
  ["email · a reply", 29, 26, 0.5, 3],
  ["group chat · a decision", 70, 24, 0.5, -3],
  ["email · a nudge", 90, 74, 1, -6],
  ["LinkedIn · an intro", 9, 80, 1.05, 5],
];

/**
 * The opening's still water: an ink wash low in the frame, with a few of the
 * feed's notices far off on it. The feed is out there; in here it is quiet.
 */
export function Water() {
  return (
    <div className="water" aria-hidden="true">
      {AFLOAT.map(([fragment, left, top, size, turn]) => {
        const { source, message, icon } = slipFor(fragment);
        return (
          <span
            className="water__slip"
            key={fragment}
            style={{ left: `${left}%`, top: `${top}%`, rotate: `${turn}deg`, "--s": size } as CSSProperties}
          >
            <svg viewBox="0 0 24 24">
              <path d={ICONS[icon] ?? ICONS.bell} />
            </svg>
            <span>
              <small>{source}</small>
              <b>{message}</b>
            </span>
          </span>
        );
      })}
    </div>
  );
}
