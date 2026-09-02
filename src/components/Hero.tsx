import type { CSSProperties } from "react";
import { EmailForm } from "./EmailForm";
import { ScrollScene } from "./ScrollScene";

import "./hero.css";

/**
 * Act I — the torrent.
 *
 * Every line below is a real `source_kinds` value from `agents/definitions/*.json`
 * followed by the sort of thing that arrives on it. The union across the five
 * definitions is exactly six kinds, none of them a social network, and Act II
 * sorts these same tokens into the lanes that declare them.
 */
const fieldLinePool = [
  "email · a reply",
  "newsletter · a digest",
  "direct_message · an ask",
  "calendar · a conflict",
  "email · a follow-up",
  "group_chat · a thread",
  "event_invite · an rsvp",
  "email · an invite",
  "newsletter · a request",
  "direct_message · a nudge",
  "calendar · a hold",
  "group_chat · a decision",
  "email · a nudge",
  "event_invite · a change",
] as const;

const COLUMN_COUNT = 9;

type FieldStyle = CSSProperties & {
  "--fd"?: string;
  "--sy"?: string;
};

function makeColumnText(columnIndex: number): string {
  const offset = (columnIndex * 5) % fieldLinePool.length;
  const block = Array.from(
    { length: 80 },
    (_, lineIndex) => fieldLinePool[(lineIndex + offset) % fieldLinePool.length],
  );

  return [...block, ...block].join("\n");
}

const columns = Array.from({ length: COLUMN_COUNT }, (_, columnIndex) => {
  const normalizedDistance =
    (columnIndex - (COLUMN_COUNT - 1) / 2) / ((COLUMN_COUNT - 1) / 2 || 1);
  const distance = Math.abs(normalizedDistance);
  // The entrance is ambience only, so it is short and its stagger is tight:
  // outer columns land a fifth of a second behind the middle one.
  const fadeDelay = 0.04 + distance * 0.2;
  // How far each column has rushed by the time it settles. The centre travels
  // furthest, which is what reads as depth.
  const scrollTravel = -(190 + (1 - distance) * 250);

  return {
    fadeDelay: `${fadeDelay.toFixed(2)}s`,
    scrollTravel: `${Math.round(scrollTravel)}px`,
    text: makeColumnText(columnIndex),
  };
});

export function Hero() {
  return (
    <ScrollScene as="section" className="hero-section" range="exit">
      <div className="hero-field" aria-hidden="true">
        {columns.map((column, columnIndex) => (
          <div
            className="hero-field__col"
            key={columnIndex}
            style={
              {
                "--fd": column.fadeDelay,
                "--sy": column.scrollTravel,
              } as FieldStyle
            }
          >
            <div className="hero-field__rush">
              <div className="hero-field__stream">{column.text}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="hero-bloom hero-bloom--paper" aria-hidden="true" />
      <div className="hero-bloom hero-bloom--sun" aria-hidden="true" />

      <div className="hero-aperture">
        <p className="hero-eyebrow">five agents · one slow feed</p>

        <h1 className="hero-headline">
          Out there the feeds never stop. In here I get a slow one.
        </h1>

        {/* The split is deliberate and load-bearing: what goes out is Tony,
            what comes in is translated by the agents. Act III's guarantee —
            they may draft but never send — is about the agents only, so the
            two acts agree rather than contradict. */}
        <p className="hero-subhead">
          Lived experience goes out; that part is me. The world comes in; agents
          translate it. This is the pace.
        </p>

        <div className="hero-rule" />

        <p className="hero-thursday">Thursday morning is still yours.</p>

        <div id="playbook" className="hero-capture">
          <EmailForm />
          <p className="hero-capture__note">
            one email when it is done. no sequence, no newsletter, no third
            party — the list lives in my own database.
          </p>
        </div>

        <p className="hero-sources">
          five agents read{" "}
          <span>
            email · newsletter · direct_message · group_chat · calendar ·
            event_invite
          </span>
        </p>
      </div>
    </ScrollScene>
  );
}
