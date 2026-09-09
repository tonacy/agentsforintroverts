import Image from "next/image";
import type { Day } from "@/lib/day";
import { Ledger } from "./Ledger";

import "./story.css";

/** Two connected loops; the complete public record stays available on demand. */
export function Story({ day }: { day: Day }) {
  return (
    <section className="story" id="practice" aria-labelledby="story-title">
      <div className="page-width">
        <header className="story__intro">
          <div className="story__intro-copy">
            <p className="eyebrow">An agent team for your work</p>
            <h2 id="story-title">Your work, out in the world.</h2>
            <p className="story__lead">
              Turn what you’re making, learning, and thinking into something you’re proud to share.
              Agents help shape, produce, and distribute it, without making social media another job.
            </p>
          </div>
          <div className="story__illustration story__illustration--opening">
            <Image
              className="story__art"
              src="/illustrations/work-in-the-world.webp"
              alt="A printed page drifting out of an open studio window."
              width={1536}
              height={1024}
              sizes="(max-width: 899px) 100vw, 55vw"
            />
          </div>
        </header>

        <div className="story__loops">
          <section className="story__loop story__loop--making" aria-labelledby="story-desk-title">
            <div className="story__loop-copy">
              <p className="eyebrow">The daily conversation</p>
              <h3 id="story-desk-title">Your work takes shape.</h3>
              <p>
                Talk with your agent team about what you’re working on and what matters to you.
                Together, you find what’s worth sharing. The team turns it into a piece that sounds
                like you, handles the production, and helps get it out into the world.
              </p>
            </div>
            <div className="story__illustration story__illustration--making">
              <Image
                className="story__art"
                src="/illustrations/work-takes-shape.webp"
                alt="Hands bringing paper fragments together into a botanical print."
                width={1536}
                height={1024}
                sizes="(max-width: 899px) 100vw, 55vw"
              />
            </div>
          </section>
          <section className="story__loop story__loop--people" aria-labelledby="story-world-title">
            <div className="story__loop-copy">
              <p className="eyebrow">The outward loop</p>
              <h3 id="story-world-title">Your work finds its people.</h3>
              <p>
                The team keeps finding places where that work belongs and ways to put it there.
                It brings relevant people and conversations back to your Desk, giving you something
                new to explore, respond to, or bring into tomorrow’s work.
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
        </div>

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
