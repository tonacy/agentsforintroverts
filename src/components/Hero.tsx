import type { CSSProperties } from "react";
import { FieldNotesStatus } from "./FieldNotesStatus";
import { HeroAnimation } from "./HeroAnimation";

const fieldLinePool = [
  "email · a reply",
  "calendar · an ask",
  "X · a mention",
  "email · a follow-up",
  "LinkedIn · an intro",
  "newsletter · a request",
  "X · a thread",
  "email · an invite",
  "calendar · a conflict",
  "LinkedIn · a message",
  "email · a nudge",
  "X · a quote",
] as const;

const COLUMN_COUNT = 9;

type FieldStyle = CSSProperties & {
  "--d"?: string;
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
  const fadeDelay = 2.3 + distance * 0.55;
  const scrollTravel = -(420 + (1 - distance) * 700);

  return {
    fadeDelay: `${fadeDelay.toFixed(2)}s`,
    scrollTravel: `${Math.round(scrollTravel)}px`,
    text: makeColumnText(columnIndex),
  };
});

const landingDelay = (delay: string): FieldStyle => ({ "--d": delay });

export function Hero() {
  return (
    <HeroAnimation>
      <section className="hero-section">
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

        <div className="hero-focus-matte" aria-hidden="true" />

        <div className="hero-aperture">
          <p className="hero-land hero-arrived" style={landingDelay("5.65s")}>
            Arrived
          </p>

          <h1
            id="hero-headline"
            className="hero-land hero-headline"
            style={landingDelay("5.78s")}
            tabIndex={-1}
          >
            Out there the feeds never stop. In here I get a slow one.
          </h1>

          <p className="hero-land hero-subhead" style={landingDelay("5.95s")}>
            Lived experience goes out. The world comes in. Agents translate both. This is the pace.
          </p>

          <div className="hero-land hero-rule" style={landingDelay("6.08s")} />

          <p className="hero-land hero-thursday" style={landingDelay("6.16s")}>
            Thursday morning is still yours.
          </p>

          <div
            id="field-notes"
            className="hero-land hero-capture"
            style={landingDelay("6.3s")}
          >
            <FieldNotesStatus />
            <p className="hero-capture__note">
              A weekly practice for participating without living in the feed.
            </p>
          </div>

          <p className="hero-land hero-translate" style={landingDelay("6.42s")}>
            agents translate{" "}
            <span>calendar · X · LinkedIn · email · newsletter</span>
          </p>
        </div>
      </section>
    </HeroAnimation>
  );
}
