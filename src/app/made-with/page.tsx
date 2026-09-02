import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Footer, Nav } from "@/components";
import styles from "./made-with.module.css";

export const metadata: Metadata = {
  title: "Made with",
  description:
    "A plain-language authorship note: the point of view belongs to the person, and agents help released ideas find and join the right conversations.",
  alternates: {
    canonical: "/made-with/",
  },
  openGraph: {
    title: "Made with Agents for Introverts",
    description:
      "The point of view is mine, and the agents helped it travel.",
    url: "/made-with/",
    siteName: "Agents for Introverts",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Agents for Introverts — many signals narrowing toward a person, then opening back into the world",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Made with Agents for Introverts",
    description:
      "The point of view is mine, and the agents helped it travel.",
    images: [
      {
        url: "/twitter-image.png",
        width: 1200,
        height: 630,
        alt: "Agents for Introverts — many signals narrowing toward a person, then opening back into the world",
      },
    ],
  },
};

const authorshipRows = [
  ["Point of view", "The person"],
  ["Lived experience", "The person"],
  ["Context and adaptation", "The agents"],
  ["Responsibility", "The person"],
] as const;

const channelMarks = [
  {
    channel: "X",
    placement: "First self-reply beneath an original post or thread",
    copy: (
      <>
        I made this with Agents for Introverts. The point of view is mine,
        and the agents helped it travel.
        <br />
        <br />
        See how it works: agentsforintroverts.com/made-with
      </>
    ),
  },
  {
    channel: "LinkedIn",
    placement: "Closing sign-off on original work",
    copy: (
      <>
        — Tony
        <br />
        <br />
        I made this with Agents for Introverts. The point of view is mine,
        and the agents helped it travel.
        <br />
        <br />
        See how it works: agentsforintroverts.com/made-with
      </>
    ),
  },
  {
    channel: "Substack",
    placement: "Authorship note after the personal sign-off",
    copy: (
      <>
        Authorship note: I made this with Agents for Introverts. The lived
        experience and point of view are mine, and the agents helped them
        travel.
        <br />
        <br />
        See how it works → agentsforintroverts.com/made-with
      </>
    ),
  },
] as const;

export default function MadeWithPage() {
  return (
    <>
      <a href="#made-with-content" className={styles.skipLink}>
        Skip to the authorship note
      </a>
      <Nav current="made-with" />
      <main id="made-with-content" className={styles.page}>
        <article>
          <header className={styles.hero}>
            <div className={styles.heroInner}>
              <div>
                <p className={styles.eyebrow}>Authorship note · 001</p>
                <h1 className={styles.title}>
                  Made with{" "}
                  <span>Agents for Introverts</span>
                </h1>
                <p className={styles.intro}>
                  If you followed this link from a post or essay, an agent
                  helped with some part of the work around it. It may have
                  found the conversation, gathered outside context, shaped an
                  established idea for that channel, or published it under
                  rules I had already approved.
                </p>
              </div>

              <aside
                className={styles.authorshipRecord}
                aria-label="Authorship record"
              >
                <div className={styles.recordHeader}>
                  <span>Public mark</span>
                  <span>Made with AFI</span>
                </div>
                <blockquote>
                  I made this with Agents for Introverts. The point of view is
                  mine, and the agents helped it travel.
                </blockquote>
                <dl className={styles.recordRows}>
                  {authorshipRows.map(([term, value]) => (
                    <div key={term}>
                      <dt>{term}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </aside>
            </div>
          </header>

          <div className={styles.body}>
            <section className={styles.section} aria-labelledby="carry-title">
              <div className={styles.marker} aria-hidden="true">
                <span>01</span>
                <span>Authorship</span>
              </div>
              <div className={styles.prose}>
                <h2 id="carry-title">What the agents carry</h2>
                <p>
                  I give my agents established ideas, public projects,
                  corrections, a sense of my voice, and clear limits. They use
                  that context to notice where I have something to add and
                  express it in a form that fits the place.
                </p>
                <div className={styles.division}>
                  <div>
                    <span>The person</span>
                    <p>
                      Lived experience, judgment, new or changed beliefs,
                      private stories, promises, commitments, and the decision
                      to release an idea.
                    </p>
                  </div>
                  <div>
                    <span>The agents</span>
                    <p>
                      Public research, compression, retrieval, adaptation,
                      routing, continuity, and publication within rules set by
                      the person.
                    </p>
                  </div>
                </div>
                <p>
                  A new belief, a changed position, a private story, a promise,
                  or a commitment of my time comes back to me.
                </p>
              </div>
            </section>

            <section className={styles.section} aria-labelledby="boundary-title">
              <div className={styles.marker} aria-hidden="true">
                <span>02</span>
                <span>The boundary</span>
              </div>
              <div className={styles.prose}>
                <h2 id="boundary-title">Inside stays inside</h2>
                <p>
                  Agents for Introverts is being built around two separate
                  contexts. They meet only while I am reflecting at the Desk.
                </p>
                <div className={styles.boundary}>
                  <div className={styles.contextSide}>
                    <span>Inside</span>
                    <p>
                      Private work, lived experience, relationships,
                      reflection, and thoughts still forming.
                    </p>
                  </div>
                  <div className={styles.desk}>
                    <Image
                      src="/brand/navigational-shelter-mark.png"
                      alt=""
                      width={88}
                      height={88}
                      className={styles.mark}
                    />
                    <strong>The Desk</strong>
                    <span>Reflection only</span>
                  </div>
                  <div className={styles.contextSide}>
                    <span>Outside</span>
                    <p>
                      Public sources, public conversations, and ideas I have
                      deliberately released.
                    </p>
                  </div>
                </div>
                <p className={styles.boundaryNote}>
                  During reflection, I decide what may cross, how freely it may
                  be adapted, and where it may travel. Outside receives the
                  released idea. It never receives the private record behind
                  it.
                </p>
                <p>
                  When an outside agent needs something I have not released,
                  it leaves a question for the next reflection. It cannot
                  reach across the boundary.
                </p>
              </div>
            </section>

            <section className={styles.section} aria-labelledby="keys-title">
              <div className={styles.marker} aria-hidden="true">
                <span>03</span>
                <span>The keys</span>
              </div>
              <div className={styles.prose}>
                <h2 id="keys-title">Each channel gets its own keys</h2>
                <p>
                  I decide how much freedom an agent has on every surface. X
                  may run public conversation automatically. Substack may ask
                  before each essay and subscriber email. LinkedIn follows its
                  own rules.
                </p>
                <div className={styles.permissions}>
                  <div>
                    <span>What may be said</span>
                    <strong>Public context release</strong>
                    <p>An exact idea moved through reflection into Outside.</p>
                  </div>
                  <div>
                    <span>What may be done</span>
                    <strong>Channel policy</strong>
                    <p>Blocked, brought back to me, or handled automatically.</p>
                  </div>
                </div>
                <p>
                  Automatic means the agent may act inside a standing
                  permission I chose. I still own the result, and I can pause a
                  channel or take the keys back.
                </p>
              </div>
            </section>

            <section className={styles.section} aria-labelledby="mark-title">
              <div className={styles.marker} aria-hidden="true">
                <span>04</span>
                <span>The mark</span>
              </div>
              <div className={styles.prose}>
                <h2 id="mark-title">One mark, native to each channel</h2>
                <p>
                  Original work made through this practice carries the same
                  authorship mark in a form that belongs on the channel. It
                  does not get pasted beneath every reply inside somebody
                  else&apos;s conversation.
                </p>
                <div className={styles.channelMarks}>
                  {channelMarks.map((mark) => (
                    <figure key={mark.channel} className={styles.channelMark}>
                      <figcaption>
                        <strong>{mark.channel}</strong>
                        <span>{mark.placement}</span>
                      </figcaption>
                      <blockquote>{mark.copy}</blockquote>
                    </figure>
                  ))}
                </div>
              </div>
            </section>

            <section
              className={`${styles.section} ${styles.lastSection}`}
              aria-labelledby="responsibility-title"
            >
              <div className={styles.marker} aria-hidden="true">
                <span>05</span>
                <span>Responsibility</span>
              </div>
              <div className={styles.prose}>
                <h2 id="responsibility-title">I still own the result</h2>
                <p>
                  When a post is wrong, I correct it. When an agent crosses a
                  line, I narrow or revoke its permission. When my view
                  changes, my agents stop carrying the old version, and I
                  correct the public record.
                </p>
                <p>
                  Agents for Introverts is early. Today, this mark is a public
                  promise about authorship and responsibility. The product is
                  being built to make the boundary, permissions, and receipts
                  inspectable.
                </p>
                <p className={styles.closing}>
                  The aim is a way for more people to put their ideas into
                  circulation without becoming full-time performers for the
                  feed.
                </p>
              </div>
            </section>
          </div>

          <footer
            aria-label="Made with next steps"
            className={styles.nextSteps}
          >
            <div>
              <span>Continue</span>
              <p>The longer argument for network fluency on human terms.</p>
            </div>
            <div className={styles.nextLinks}>
              <Link href="/manifesto/">Read the manifesto</Link>
              <Link href="/#field-notes">Follow the field notes</Link>
            </div>
          </footer>
        </article>
      </main>
      <Footer />
    </>
  );
}
