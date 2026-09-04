import type { Metadata } from "next";
import Link from "next/link";
import { Footer, Nav } from "@/components";
import styles from "./manifesto.module.css";

const description =
  "Agents should help me understand what matters, publish my ideas, and find people worth working with.";

export const metadata: Metadata = {
  title: "Manifesto",
  description,
  alternates: {
    canonical: "/manifesto/",
  },
  openGraph: {
    title: "The Agents for Introverts Manifesto",
    description,
    url: "/manifesto/",
    siteName: "Agents for Introverts",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Agents for Introverts Manifesto",
    description,
  },
};

export default function ManifestoPage() {
  return (
    <>
      <a href="#manifesto-content" className={styles.skipLink}>
        Skip to the manifesto
      </a>
      <Nav current="manifesto" />
      <main id="manifesto-content" className={styles.page}>
        <article>
          <header className={styles.intro}>
            <div className={styles.introInner}>
              <p className={styles.eyebrow}>A manifesto</p>
              <h1 className={styles.title}>
                Agents <span>for Introverts</span>
              </h1>
              <div className={styles.introMeta}>
                <span>Written by Tony Llongueras</span>
              </div>
            </div>
          </header>

          <div className={`${styles.manifesto} ${styles.prose}`}>
            <p id="relationship">
              I have things to contribute, but I don’t want to spend my life
              keeping up with feeds and promoting myself.
            </p>
            <p className={styles.emphasis}>
              Agents should help me understand what matters, publish my ideas,
              and find people worth working with.
            </p>
            <p>
              As AI makes it easier to build things, relationships matter more.
              We still need people who understand our work, trust us, and want
              to act with us. But the internet rewards people who know how to
              stay visible. Having something worth contributing and knowing how
              to get attention are different skills.
            </p>

            <hr className={styles.divider} />

            <p id="path">
              A few years ago, I built Woon, an agent that lived inside iMessage.
              I believed it needed to exist, so I built it. Then I waited.
            </p>
            <p>
              I knew how to build the product. I didn’t know how to help it find
              its people.
            </p>
            <p>
              Maybe it was too early. Maybe it would have failed anyway. But it
              never reached the people who could have challenged it, shaped it,
              or helped it grow.
            </p>
            <p>Agents for Introverts is the tool I wish I’d had then.</p>

            <hr className={styles.divider} />

            <p id="feed">
              I want an agent that follows the conversations I care about and
              brings back what matters. Four hundred people are not one person,
              and a summary can invent agreement that does not exist. My agent
              should cut through repetition, show where people disagree, and
              let me trace a summary back to the people who said it.
            </p>
            <p id="context">
              I want it to remember what I’ve made, what I think, and what I’m
              trying to do. It should help me publish my ideas and find places
              where they could contribute. I shouldn’t have to reconstruct
              myself every time I enter a conversation.
            </p>
            <p id="connection">
              The point is to find people. Four hundred people might share an
              interest. Two or three might want to build something together.
              An agent can help us find each other. The relationship grows
              through what we choose to do next.
            </p>
            <p>
              That takes trust. I need to be able to correct my agent and have it
              learn from those corrections. It can earn more freedom with ideas
              I already stand behind. Changes in belief and commitments of my
              time still belong to me.
            </p>
            <p id="participation">
              More people should be able to contribute without making
              participation a full-time job. I want our ideas to reach one
              another, and our time together to go toward something we care
              about.
            </p>
            <p className={styles.closingStatement}>
              Success means more people participating, not more automated
              content.
            </p>
          </div>

          <footer
            aria-label="Manifesto authorship note"
            className={styles.postscript}
          >
            <div>
              <span>Authorship</span>
              <p>See what it means when an idea is made with agents.</p>
            </div>
            <Link href="/made-with/" className={styles.postscriptLink}>
              See how authorship works <span aria-hidden="true">↗</span>
            </Link>
          </footer>
        </article>
      </main>
      <Footer />
    </>
  );
}
