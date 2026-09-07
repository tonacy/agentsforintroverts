import type { Day } from "@/lib/day";
import { MAX_PLACES } from "@/lib/day";

import "./ledger.css";

/**
 * One day of the practice, laid out as a ledger: what came in, what Tony
 * brought, where the two met. Server-rendered from `Day`; nothing here moves.
 */
export function Ledger({ day }: { day: Day }) {
  const placeCount = day.places.length;
  const emptySlots = Math.max(0, MAX_PLACES - placeCount);

  return (
    <section className="ledger" id="today" aria-labelledby="ledger-title">
      <div className="page-width">
      <header className="ledger__head">
        <div className="ledger__title">
          <h2 id="ledger-title" className="ledger__weekday">
            {day.weekday}
          </h2>
          {day.example && <span className="tag">example day</span>}
        </div>
        <p className="ledger__meta">
          daily conversation · kept in public · every claim opens to its source
        </p>
      </header>

      <div className="ledger__grid">
        <div className="ledger__outside">
          <div className="ledger__col-head">
            <span className="eyebrow">Outside · what came in</span>
            <span className="ledger__count">
              {day.outside.length} {day.outside.length === 1 ? "thread" : "threads"} ·{" "}
              {day.outside.reduce((n, o) => n + o.sources.length, 0)} sources
            </span>
          </div>

          {day.outside.map((item) => (
            <article className="ledger__item" key={item.distillation}>
              <p className="ledger__surface">{item.surface}</p>
              <p className="ledger__distillation">{item.distillation}</p>
              <ul className="ledger__doors">
                {item.sources.map((source) => (
                  <li key={source.url}>
                    <a
                      className="door"
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Source: ${source.label}`}
                    >
                      {source.label} →
                    </a>
                  </li>
                ))}
              </ul>
              {item.disagreement && (
                <p className="ledger__disagreement">
                  <span className="ledger__flag">disagreement kept</span> {item.disagreement}
                </p>
              )}
            </article>
          ))}
        </div>

        <div className="ledger__divider" aria-hidden="true" />

        <div className="ledger__inside">
          <div className="ledger__col-head">
            <span className="eyebrow">Inside · what I brought</span>
            {day.inside && <span className="ledger__count">written by Tony · {day.inside.mode_label}</span>}
          </div>

          {day.inside ? (
            <p className="ledger__capture">{day.inside.text}</p>
          ) : (
            <p className="ledger__capture ledger__capture--none">
              No new input today. That is a choice, not a gap.
            </p>
          )}

          {day.context_used.length > 0 && (
            <>
              <div className="home-rule" />
              <div className="ledger__context">
                <span className="eyebrow">Context the agents used</span>
                <ul className="ledger__tags">
                  {day.context_used.map((c) => (
                    <li className={`tag tag--${c.basis}`} key={`${c.basis}-${c.label}`}>
                      {c.basis} · {c.label}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>

        <aside className="ledger__margin" aria-hidden="true">
          <span>recurrence<br />is not<br />consensus</span>
          <span>every claim<br />opens to<br />its source</span>
          <span>explicit ≠<br />observed ≠<br />inferred</span>
        </aside>
      </div>

      <div className="ledger__places">
        <div className="ledger__col-head">
          <span className="eyebrow">Places · where the two met today</span>
          <span className="ledger__count">
            {placeCount} of at most {MAX_PLACES} · zero is a useful result
          </span>
        </div>

        <ol className="ledger__place-list">
          {day.places.map((place) => (
            <li className="ledger__place" key={place.index}>
              <span className="ledger__place-kind">
                {String(place.index).padStart(2, "0")} · {place.kind}
              </span>
              <p className="ledger__place-title">{place.title}</p>
              <p className="ledger__place-fit">{place.fit}</p>
              <div className="ledger__place-status">
                <span className="tag tag--held">{place.status}</span>
                <span className="ledger__count">nothing sent</span>
              </div>
            </li>
          ))}
          {Array.from({ length: emptySlots }, (_, i) => (
            <li className="ledger__place ledger__place--empty" key={`empty-${i}`}>
              <span className="ledger__place-kind">
                {String(placeCount + i + 1).padStart(2, "0")} · —
              </span>
              {i === 0 && day.held_note ? (
                <p className="ledger__place-title">{day.held_note}</p>
              ) : (
                <p className="ledger__place-title">No place here today.</p>
              )}
            </li>
          ))}
        </ol>

        <aside className="ledger__margin ledger__margin--places" aria-hidden="true">
          <span>held until<br />Tony says so</span>
        </aside>
      </div>

      <p className="ledger__foot">
        Nothing on this page was sent. The agents draft and hold. I decide what crosses.
      </p>
      </div>
    </section>
  );
}
