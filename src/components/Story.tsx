import Image from "next/image";
import Link from "next/link";

import "./story.css";

/**
 * What comes back. The opening ends on the people the work was for; this is
 * the other half of the loop, where their answers become the next day's work,
 * and where the page's story ends.
 */
export function Story() {
  return (
    <section className="story" aria-labelledby="story-title">
      <div className="page-width">
        <div className="story__loop story__loop--people">
          <div className="story__loop-copy">
            <p className="eyebrow">What comes back</p>
            <h2 id="story-title">Their answers land on your desk.</h2>
            <p>
              A reply worth answering. A question you hadn’t thought of. Someone building the same
              thing. The team keeps finding where your work belongs and brings back what it finds, as
              loose pages for tomorrow: something real to answer, or to carry into the next thing you
              make.
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
        </div>

        <p className="story__resolution">Your work keeps moving. You keep making.</p>
        <Link className="story__belief" href="/manifesto/">
          Read the manifesto →
        </Link>
      </div>
    </section>
  );
}
