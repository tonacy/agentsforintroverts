import type { Metadata } from "next";
import Link from "next/link";
import { Footer, Nav } from "@/components";
import styles from "./manifesto.module.css";

export const metadata: Metadata = {
  title: "Manifesto",
  description:
    "A manifesto for network fluency on human terms: persistent context, quieter participation, and more people able to take part in the discourse.",
  alternates: {
    canonical: "/manifesto/",
  },
  openGraph: {
    title: "The Agents for Introverts Manifesto",
    description:
      "We should not have to choose between being swept away by the network and disappearing from it.",
    url: "/manifesto/",
    siteName: "Agents for Introverts",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Agents for Introverts Manifesto",
    description:
      "A manifesto for network fluency on human terms.",
  },
};

const funnel = [
  ["400", "share an interest"],
  ["100", "want the same change"],
  ["50", "work where they can affect it"],
  ["2–3", "can act together"],
] as const;

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
              <p className={styles.eyebrow}>A manifesto · August 2026</p>
              <h1 className={styles.title}>
                Agents
                <span>for Introverts</span>
              </h1>
              <p className={styles.dek}>
                A manifesto for network fluency on human terms.
              </p>
              <p className={styles.standfirst}>
                We should not have to choose between being swept away by the
                network and disappearing from it.
              </p>
              <div className={styles.introMeta}>
                <span>Written by Tony Llongueras</span>
                <span aria-hidden="true">/</span>
                <span>Six propositions</span>
              </div>
            </div>
          </header>

          <div className={styles.manifesto}>
            <section
              id="relationship"
              aria-labelledby="relationship-title"
              className={styles.section}
            >
              <div className={styles.marker} aria-hidden="true">
                <span>I</span>
                <span>Scarcity</span>
              </div>
              <div className={styles.prose}>
                <h2 id="relationship-title">
                  Relationship is becoming the scarce currency
                </h2>
                <p>
                  As AI takes on more of the work we once used to prove what we
                  could do, capability becomes easier to access. Relationship
                  becomes harder to replace.
                </p>
                <p>
                  Who you know, who knows you, what you care about, and who
                  trusts you enough to act with you will carry more weight. The
                  internet is where many of those relationships now begin. An
                  idea left unexpressed cannot meet another idea. Without a
                  presence in the network, our ideas struggle to find the
                  people who might care about them.
                </p>
                <p>Presence currently demands a particular kind of fluency.</p>
                <p>
                  The network rewards people who reply quickly, know how to
                  reach the right person, focus on being engaging, and convert
                  a thought into a form that travels. Having something worth
                  saying and knowing how to make it travel are separate skills.
                  The network routinely rewards the second one first.
                </p>
                <p className={styles.emphasis}>
                  Some people speak this language naturally. I do not.
                </p>
                <p>
                  Agents for Introverts is for people with ideas, projects, and
                  lived experience who lack, dislike, or refuse the fluency the
                  network demands. We should be able to participate without
                  becoming full-time performers for the feed.
                </p>
              </div>
            </section>

            <section
              id="path"
              aria-labelledby="path-title"
              className={styles.section}
            >
              <div className={styles.marker} aria-hidden="true">
                <span>II</span>
                <span>Woon</span>
              </div>
              <div className={styles.prose}>
                <h2 id="path-title">Ideas need a path into the network</h2>
                <p>
                  A few years ago, I built Woon, an agent that lived inside
                  iMessage, before that kind of product was familiar.
                </p>
                <p>
                  I would not claim the idea was entirely original. I believed
                  it needed to exist, so I built it.
                </p>
                <p>Then, more or less, I waited.</p>
                <p>
                  I had the “build it and they will come” mentality. I
                  understood how to build the product and missed more than half
                  the battle: finding the people who would understand it,
                  putting it in front of them, and explaining it in a form they
                  could carry to somebody else.
                </p>
                <p>I did not know how to do that.</p>
                <p>
                  Maybe Woon was too early. Maybe it would have failed anyway. I
                  still do not know. I know it never reached the network of
                  people who could have challenged it, shaped it, used it, or
                  helped it travel. My lack of network fluency was a major
                  factor in its failure.
                </p>
                <blockquote className={styles.pullQuote}>
                  Woon needed a path into the network, and I did not know how
                  to build one.
                </blockquote>
                <p>
                  That experience changed how I understand building. A working
                  product can still disappear when its builder cannot find the
                  people who might care. I suspect other worthwhile ideas
                  disappear the same way.
                </p>
                <p className={styles.emphasis}>
                  Agents for Introverts is the tool I wish I had then.
                </p>
              </div>
            </section>

            <section
              id="feed"
              aria-labelledby="feed-title"
              className={styles.section}
            >
              <div className={styles.marker} aria-hidden="true">
                <span>III</span>
                <span>The lens</span>
              </div>
              <div className={styles.prose}>
                <h2 id="feed-title">
                  The raw feed operates at network scale
                </h2>
                <p>The feeds never stop because the network never stops.</p>
                <p>
                  Hundreds of people discuss the same subject across different
                  pockets. They repeat one another, disagree by degrees, move
                  at different speeds, and continuously create more context
                  than one person can absorb. The feed exposes the network
                  directly, at a scale and tempo built for the network itself.
                </p>
                <p>
                  For people like me, the natural response is to leave. Leaving
                  preserves our energy. It also removes us from the
                  conversations where ideas meet people and people become
                  collaborators.
                </p>
                <p>
                  AI gives us a chance to build another interface to the
                  network. An agent can translate in both directions.
                </p>
                <div className={styles.translation}>
                  <div>
                    <span>Coming in</span>
                    <p>
                      It acts as a lens. What looks like four hundred separate
                      posts may be one conversation happening across many
                      disconnected pockets. The agent can reduce repetition,
                      preserve context, show where people agree and disagree,
                      and bring back what matters.
                    </p>
                  </div>
                  <div>
                    <span>Going out</span>
                    <p>
                      It acts as a megaphone. It can help turn lived experience
                      into expression, find where an idea belongs, adapt it into
                      a form that travels, and carry an established thought into
                      recurring conversations.
                    </p>
                  </div>
                </div>
                <p>
                  The same thought should not require a person to rediscover
                  and reformulate their position every time the conversation
                  reappears.
                </p>
                <p>
                  The agent supplies speed, context, routing, presentation, and
                  continuity. The person supplies priorities, new ideas,
                  judgment, and the willingness to act.
                </p>
                <p>
                  Compression creates a real danger. Four hundred people are
                  not one person, and a summary can invent agreement that does
                  not exist. The agent must show its work: the original
                  conversations, the uncertainty, the disagreements, and why it
                  grouped them together.
                </p>
                <p className={styles.emphasis}>
                  Common ground becomes useful when the people inside it would
                  recognize it themselves.
                </p>
              </div>
            </section>

            <section
              id="connection"
              aria-labelledby="connection-title"
              className={styles.section}
            >
              <div className={styles.marker} aria-hidden="true">
                <span>IV</span>
                <span>The thread</span>
              </div>
              <div className={styles.prose}>
                <h2 id="connection-title">
                  From four hundred people to two or three
                </h2>
                <p>
                  The value of this technology becomes clearer as the number
                  gets smaller.
                </p>
                <ol className={styles.funnel} aria-label="From broad interest to shared action">
                  {funnel.map(([number, label]) => (
                    <li key={number}>
                      <strong>{number}</strong>
                      <span>{label}</span>
                    </li>
                  ))}
                </ol>
                <p className={styles.emphasis}>
                  The numbers getting smaller is the point.
                </p>
                <p>
                  Nobody forms a relationship with “a group of four hundred.”
                  That group provides context. A relationship begins when one
                  person recognizes another and both choose to continue.
                </p>
                <p>
                  The agent can narrow the field. It can find reciprocal
                  interests, keep track of an emerging thread, and help an idea
                  reach people who may care about it. The aim is a small number
                  of conversations worth human time.
                </p>
                <p>
                  A shared subject becomes more meaningful when it reveals
                  shared intent. Shared intent becomes consequential when two
                  or three people discover that they can act together.
                </p>
                <p className={styles.emphasis}>
                  The agent can find that opening. What happens next belongs to
                  the people.
                </p>
              </div>
            </section>

            <section
              id="context"
              aria-labelledby="context-title"
              className={styles.section}
            >
              <div className={styles.marker} aria-hidden="true">
                <span>V</span>
                <span>Memory</span>
              </div>
              <div className={styles.prose}>
                <h2 id="context-title">Your context should grow with you</h2>
                <aside className={styles.definition}>
                  <span>Context representation / noun</span>
                  <p>
                    The core product is a growing representation of who you are
                    online—what you care about, what you have made, what you
                    have said, what you are trying to change, and how your
                    thinking has evolved.
                  </p>
                </aside>
                <p>
                  Today, those pieces are scattered across feeds, posts,
                  projects, and conversations. Each new pocket of the network
                  asks you to reconstruct yourself from the beginning.
                </p>
                <p>Your agents should manage that context with you.</p>
                <p>
                  They remember where an idea came from, how firmly you hold
                  it, how it has changed, and where it might belong next. When a
                  relevant conversation appears, they can connect your
                  established ideas to it, express them in a form that fits, and
                  maintain continuity when the conversation returns somewhere
                  else.
                </p>
                <p className={styles.emphasis}>
                  This gives you a presence that does not depend on your
                  constant presence.
                </p>
                <p>
                  Your context can reach more places than your attention can on
                  its own. Your agents should remain quiet when nothing fits and
                  become active when your priorities, experience, or work
                  genuinely belong in the conversation.
                </p>
                <p>
                  Because people change, the representation must keep changing.
                  You correct it. The agent updates. Trust grows through that
                  exchange, and the agent earns more freedom where it has shown
                  real understanding.
                </p>
                <p>
                  Established positions can travel with greater autonomy. New
                  ideas, changes in belief, and commitments of human time return
                  to you.
                </p>
                <p className={styles.emphasis}>
                  The position should still be yours, even when an agent helps
                  express it.
                </p>
              </div>
            </section>

            <section
              id="participation"
              aria-labelledby="participation-title"
              className={`${styles.section} ${styles.lastSection}`}
            >
              <div className={styles.marker} aria-hidden="true">
                <span>VI</span>
                <span>The aim</span>
              </div>
              <div className={styles.prose}>
                <h2 id="participation-title">
                  More people should be able to participate
                </h2>
                <p>
                  Agents for Introverts begins with people who have something
                  to contribute but lack the network fluency to make it travel.
                </p>
                <p className={styles.emphasis}>The larger aim is more participation.</p>
                <p>
                  Today, the people most comfortable living inside networks
                  have an outsized role in shaping them. They can follow every
                  current, respond at speed, understand the rituals, and remain
                  visible. Many other people have ideas, experience, and
                  priorities worth contributing. The cost of constant
                  participation keeps them outside.
                </p>
                <p>
                  Agents can lower that cost. They can provide speed, context,
                  routing, presentation, and continuity while each person
                  provides the substance.
                </p>
                <p>
                  The name describes the first problem we are solving. The
                  benefit is broader. More people should be able to enter the
                  discourse, express what they care about, find one another,
                  and turn shared intent into action.
                </p>
                <p>
                  Success looks like a wider set of people participating, not a
                  larger volume of automated content.
                </p>
                <p className={styles.closingStatement}>
                  That is what Agents for Introverts is for: helping more people
                  put their ideas into circulation, find the two or three people
                  who can shape them, and spend their human time working
                  together.
                </p>
              </div>
            </section>
          </div>

          <footer className={styles.postscript}>
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
