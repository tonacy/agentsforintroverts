import Image from "next/image";
import type { Day } from "@/lib/day";
import { Ledger } from "./Ledger";

import "./story.css";

/**
 * What comes back. The opening ends on people answering; this is that half of
 * the loop, and the complete public record stays on demand.
 */
export function Story({ day }: { day: Day }) {
  return (
    <section className="story" id="practice" aria-labelledby="story-title">
      <div className="page-width">
        <section className="story__loop story__loop--people" aria-labelledby="story-title">
          <div className="story__loop-copy">
            <p className="eyebrow">What comes back</p>
            <h2 id="story-title">Then the conversations start.</h2>
            <p>
              A reply, a question, someone working on the same problem. The team keeps finding the
              places where your work belongs, and brings the people and conversations it finds back
              to your Desk: something real to answer, or to carry into tomorrow’s work.
            </p>
            <p className="story__aside">
              Four hundred people might share an interest. Two or three might want to build
              something together.
            </p>
          </div>
          <div className="story__illustration story__illustration--people">
            <Image
              className="story__art"
              src="/illustrations/work-finds-people.webp"
              alt="Three people gathered around a print at a quiet garden table."
              width={1536}
              height={1024}
              sizes="(max-width: 899px) 100vw, 55vw"
            />
          </div>
        </section>

        <p className="story__resolution">Your work keeps moving. You keep making.</p>

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
