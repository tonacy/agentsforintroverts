import type { Day } from "@/lib/day";
import { Ledger } from "./Ledger";

import "./story.css";

/** The landing-page story stays simple; the complete public record is optional. */
export function Story({ day }: { day: Day }) {
  return (
    <section className="story" id="practice" aria-labelledby="story-title">
      <div className="page-width">
        <header className="story__intro">
          <p className="eyebrow">What a slower feed makes room for</p>
          <h2 id="story-title">A conversation you can contribute to.</h2>
          <p className="story__lead">
            The agents connect what’s being discussed with what you’ve made, learned, or lived.
            You get a few useful openings. You decide what to do with them.
          </p>
        </header>

        <div className="story__example-head">
          <span className="eyebrow">One thread, followed through</span>
          <span className="story__note">an illustrative walkthrough</span>
        </div>

        <ol className="story__sequence">
          <li className="story__step">
            <span className="story__number" aria-hidden="true">01</span>
            <h3>Find the thread.</h3>
            <p className="story__explanation">A recurring conversation surfaces, with enough context to understand it.</p>
            <div className="story__example">
              <span className="story__label">The conversation</span>
              <p>Should an agent ever press send?</p>
              <span className="story__detail">People agree on drafting. They disagree on who gets the final say.</span>
            </div>
          </li>
          <li className="story__step">
            <span className="story__number" aria-hidden="true">02</span>
            <h3>Bring your perspective.</h3>
            <p className="story__explanation">Your work and experience give you a reason to be part of that conversation.</p>
            <div className="story__example">
              <span className="story__label">The connection</span>
              <p>You’ve been working on that very question.</p>
              <span className="story__detail">Say you’re building an agent that waits for approval. You have a choice to explain and something to learn.</span>
            </div>
          </li>
          <li className="story__step">
            <span className="story__number" aria-hidden="true">03</span>
            <h3>Choose your way in.</h3>
            <p className="story__explanation">Consider a useful next step, with the decision still yours.</p>
            <div className="story__example story__example--decision">
              <span className="story__label">The opening</span>
              <p>A reply you could stand behind.</p>
              <span className="story__detail">Review the suggestion. Make it yours, read a little more, or leave it for another day.</span>
            </div>
          </li>
        </ol>

        <p className="story__resolution">A reason to join. The freedom to pass.</p>

        <details className="story__record">
          <summary>
            <span>{day.example ? "See the full example day" : "See the published day"}</span>
            <span className="story__record-note">sources, context, and suggested next steps</span>
            <span className="story__toggle" aria-hidden="true" />
          </summary>
          <Ledger day={day} />
        </details>
      </div>
    </section>
  );
}
