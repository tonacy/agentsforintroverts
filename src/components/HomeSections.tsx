import Link from "next/link";
import { FieldNotesStatus } from "./FieldNotesStatus";

const steps = [
  { title: "A small view of the outside", body: "Relevant conversations, original sources, and the disagreements a summary might hide." },
  { title: "What changed in your day?", body: "What you made, learned, noticed, or changed your mind about. You decide what becomes context." },
  { title: "A few places worth your time", body: "Zero to three specific openings where your work or experience may have something to add." },
];

export function HomeSections() {
  return (
    <>
      <section id="practice" className="home-section home-section--warm" aria-labelledby="lens-title">
        <div className="page-width section-stack">
          <p className="eyebrow">01 / The lens</p>
          <h2 id="lens-title">The world comes in.<br />Your ideas go out.</h2>
          <div className="two-columns">
            <div className="ruled-block"><p className="eyebrow">Coming in</p><h3>A smaller view. A fuller picture.</h3><p>Agents can gather the conversations that matter, reduce repetition, and preserve the sources and disagreements behind them.</p></div>
            <div className="ruled-block"><p className="eyebrow">Going out</p><h3>An idea, finding its people.</h3><p>Agents can help an established thought find a form and a place to travel. Your experience, judgment, and commitments remain yours.</p></div>
          </div>
          <p className="reading-line">The aim is a few conversations worth your human time.</p>
        </div>
      </section>
      <section className="home-section" aria-labelledby="conversation-title">
        <div className="page-width section-stack">
          <p className="eyebrow">02 / The Daily Conversation</p>
          <h2 id="conversation-title">Begin with your day.</h2>
          <p className="section-intro">One continuing conversation between your lived day and the outside world. A way to notice where the two meet, at a depth you choose.</p>
          <div className="three-columns">
            {steps.map((step, index) => <div className="ruled-block" key={step.title}><span className="step-number">0{index + 1}</span><h3>{step.title}</h3><p>{step.body}</p></div>)}
          </div>
          <aside className="attention-note section-stack">
            <p className="eyebrow">Your attention sets the pace</p>
            <h3>Short version / Deeper look / No new input</h3>
            <p>A Place is a particular conversation, person, or project where participation makes sense now. Learn, hold, respond, create—or leave it for another day. Zero is a useful result.</p>
          </aside>
          <p className="label">The practice we’re developing. Quiet Desk is a local prototype; the steps above describe the intended experience.</p>
        </div>
      </section>
      <section className="home-section home-section--forest" aria-labelledby="boundary-title">
        <div className="page-width section-stack">
          <p className="eyebrow">03 / The human line</p>
          <h2 id="boundary-title">Inside stays inside.</h2>
          <div className="two-columns">
            <div className="ruled-block"><h3>Inside</h3><p className="section-intro">Private work. Lived experience. Relationships. Reflection. Thoughts still forming.</p></div>
            <div className="ruled-block"><h3>Outside</h3><p className="section-intro">Public sources. Public conversations. Ideas you have deliberately released.</p></div>
          </div>
          <div className="home-rule" />
          <p className="home-quote">You decide what crosses.</p>
          <p className="section-intro section-intro--wide">Reflection is where the two sides meet. You choose which idea may travel. The private record behind it stays inside. New beliefs, private stories, promises, and commitments come back to you.</p>
          <Link className="action action--paper" href="/made-with/">How authorship works ↗</Link>
        </div>
      </section>
      <section className="home-section" aria-labelledby="manifesto-invitation">
        <div className="page-width section-stack">
          <h2 id="manifesto-invitation" className="eyebrow">04 / The manifesto</h2>
          <blockquote className="home-quote">“We should not have to choose between being swept away by the network and disappearing from it.”</blockquote>
          <p className="label">Tony Llongueras / Six propositions / August 2026</p>
          <p className="section-intro">An argument for helping more people put their ideas into circulation, find one another, and spend their human time working together.</p>
          <Link className="action action--primary" href="/manifesto/">Read the manifesto →</Link>
        </div>
      </section>
      <section id="field-notes" className="home-section home-section--sage" aria-labelledby="practice-title">
        <div className="page-width section-stack">
          <p className="eyebrow">05 / Follow the practice</p>
          <div className="two-columns publication-columns">
            <div className="section-stack">
              <h2 id="practice-title">A practice,<br />becoming a product.</h2>
              <p className="section-intro">Start with the manifesto. Follow the field notes as the practice takes shape: one recurring conversation, a lived point of view, and a few human threads worth continuing.</p>
              <p>For now, publication is manual and Quiet Desk is a local prototype. The public practice comes first.</p>
            </div>
            <FieldNotesStatus />
          </div>
        </div>
      </section>
    </>
  );
}
