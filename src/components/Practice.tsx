import Link from "next/link";

import { fieldNotesPublicationUrl } from "@/lib/site";
import { hubOrigin } from "@/lib/subscribe";
import { EmailForm } from "./EmailForm";

import "./practice.css";

const steps = [
  {
    title: "Outside comes in",
    body: "Recurring conversations, compressed with their sources and their disagreements intact.",
  },
  {
    title: "I bring the day",
    body: "What I made, learned, noticed, or changed my mind about. Short version, deeper look, or no new input.",
  },
  {
    title: "One conversation",
    body: "Where the two meet, at a depth I choose. It remembers what I stand behind.",
  },
  {
    title: "Zero to three places",
    body: "Specific openings where my work has something to add. Learn, hold, respond, or create.",
  },
  {
    title: "I decide",
    body: "An exact proposal, held. Approval binds that exact draft. Corrections teach the agents.",
  },
] as const;

/** Everything after the day: how it works, the line, the manifesto, the list. */
export function Practice() {
  const isPublished = fieldNotesPublicationUrl !== null;
  // The form posts to Quiet Hub. Until a hub origin is configured for this
  // build, offering the form would only show visitors an error.
  const canCapture = hubOrigin.length > 0;

  return (
    <>
      <section className="practice practice--warm" id="practice" aria-labelledby="practice-title">
        <div className="page-width practice__stack">
          <div className="practice__head">
            <h2 id="practice-title" className="eyebrow">
              How a day works
            </h2>
            <span className="practice__note">one loop · once a day · no content obligation</span>
          </div>
          <ol className="practice__steps">
            {steps.map((step, index) => (
              <li className="practice__step" key={step.title}>
                <span className="practice__step-number">{index + 1}</span>
                <span className="practice__step-title">{step.title}</span>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="practice practice--forest" aria-labelledby="line-title">
        <div className="page-width practice__line">
          <div className="practice__line-lead">
            <span className="eyebrow">The human line</span>
            <h2 id="line-title">Inside stays inside.</h2>
            <p className="practice__line-quote">You decide what crosses.</p>
          </div>
          <div className="practice__line-sides">
            <div className="practice__side">
              <h3>Inside</h3>
              <p>Private work. Lived experience. Relationships. Reflection. Thoughts still forming.</p>
            </div>
            <div className="practice__side">
              <h3>Outside</h3>
              <p>Public sources. Public conversations. Ideas I have deliberately released.</p>
            </div>
            <p className="practice__line-foot">
              Agents may draft. They never send. New beliefs, private stories, promises, and commitments come
              back to me. <Link href="/made-with/">How authorship works ↗</Link>
            </p>
          </div>
        </div>
      </section>

      <section className="practice practice--manifesto" aria-labelledby="manifesto-title">
        <div className="page-width practice__stack practice__stack--narrow">
          <h2 id="manifesto-title" className="eyebrow">
            The manifesto
          </h2>
          <blockquote className="practice__quote">
            “We should not have to choose between being swept away by the network and disappearing from it.”
          </blockquote>
          <span className="practice__note">Tony Llongueras · August 2026</span>
          <p className="practice__intro">
            An argument for helping more people put their ideas into circulation, find one another, and spend
            their human time working together.
          </p>
          <Link className="action action--primary" href="/manifesto/">
            Read the manifesto →
          </Link>
        </div>
      </section>

      <section className="practice practice--sage" id="field-notes" aria-labelledby="follow-title">
        <div className="page-width practice__follow">
          <div className="practice__stack">
            <span className="eyebrow">Follow the practice</span>
            <h2 id="follow-title">A practice, becoming a product.</h2>
            <p className="practice__intro">
              Once a week I turn one recurring conversation into a sourced field note, add my own position, and
              follow at most three human threads. Quiet Desk, the tool behind this page, is a local prototype for
              now.
            </p>
          </div>
          <div className="practice__card">
            <span className="eyebrow">{isPublished ? "Slow Feed · publishing" : "Slow Feed · in preparation"}</span>
            <p className="practice__card-title">
              {isPublished ? "Slow Feed is now publishing." : "The first field note is being written."}
            </p>
            <p className="practice__card-body">
              What the agents saw. What I approved or rejected. Where they were wrong. And whether a real human
              connection followed.
            </p>
            {isPublished ? (
              <Link className="action action--primary" href={fieldNotesPublicationUrl as string}>
                Read the field notes →
              </Link>
            ) : canCapture ? (
              <>
                <EmailForm />
                <span className="practice__note">
                  one email when it is written · no sequence · the list lives in my own database
                </span>
              </>
            ) : (
              <>
                <Link className="action action--primary" href="/manifesto/">
                  Read the manifesto →
                </Link>
                <span className="practice__note">the list opens with the first field note · no sequence · no third party</span>
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
