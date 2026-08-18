import type { CSSProperties } from "react";
import { EmailForm } from "./EmailForm";
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
            <div className="hero-field__col" key={columnIndex}>
              <div
                className="hero-field__rush"
                style={{ "--fd": column.fadeDelay } as FieldStyle}
              >
                <div
                  className="hero-field__stream"
                  style={{ "--sy": column.scrollTravel } as FieldStyle}
                >
                  {column.text}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="hero-bloom hero-bloom--paper" aria-hidden="true" />
        <div className="hero-bloom hero-bloom--sun" aria-hidden="true" />

        <div className="hero-aperture">
          <p className="hero-land hero-arrived" style={landingDelay("5.1s")}>
            Arrived
          </p>

          <h1 className="hero-land hero-headline" style={landingDelay("5.3s")}>
            Out there the feeds never stop. In here I get a slow one.
          </h1>

          <p className="hero-land hero-subhead" style={landingDelay("5.65s")}>
            Lived experience goes out. The world comes in. Agents translate both. This is the pace.
          </p>

          <div className="hero-land hero-rule" style={landingDelay("5.85s")} />

          <p className="hero-land hero-thursday" style={landingDelay("5.95s")}>
            Thursday morning is still yours.
          </p>

          <div
            id="playbook"
            className="hero-land hero-capture"
            style={landingDelay("6.2s")}
          >
            <EmailForm />
            <p className="hero-capture__note">
              Free — The Quiet Operator&apos;s Agent Stack. Five setups, no spam.
            </p>
          </div>

          <p className="hero-land hero-translate" style={landingDelay("6.45s")}>
            agents translate{" "}
            <span>calendar · X · LinkedIn · email · newsletter</span>
          </p>
        </div>
      </section>
    </HeroAnimation>
  );
}
