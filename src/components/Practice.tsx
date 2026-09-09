import Link from "next/link";

import { fieldNotesPublicationUrl } from "@/lib/site";
import { hubOrigin } from "@/lib/subscribe";
import { EmailForm } from "./EmailForm";

import "./practice.css";

/** The decision stays human; the next invitation is to follow the practice. */
export function Practice() {
  const isPublished = fieldNotesPublicationUrl !== null;
  // The form posts to Quiet Hub. Until a hub origin is configured for this
  // build, offering the form would only show visitors an error.
  const canCapture = hubOrigin.length > 0;

  return (
    <>
      <section className="practice practice--forest" aria-labelledby="line-title">
        <div className="page-width practice__line">
          <div className="practice__line-lead">
            <span className="eyebrow">The human line</span>
            <h2 id="line-title">You decide what crosses.</h2>
            <p className="practice__line-quote">There is no obligation to post.</p>
          </div>
          <div className="practice__decision">
            <p>
              The agents can gather context and prepare a draft. You choose whether to
              respond, keep learning, or leave it there. Nothing gets sent for you.
            </p>
            <p>
              Your work, experiences, and relationships help you find common ground.
              You decide which parts become public.
            </p>
            <Link className="practice__belief" href="/manifesto/">Read the manifesto →</Link>
            <Link className="practice__authorship" href="/made-with/">How authorship works ↗</Link>
          </div>
        </div>
      </section>

      <section className="practice practice--sage" id="field-notes" aria-labelledby="follow-title">
        <div className="page-width practice__follow">
          <div className="practice__stack">
            <span className="eyebrow">Follow the practice</span>
            <h2 id="follow-title">A practice, becoming a product.</h2>
            <p className="practice__intro">
              I’m building Quiet Desk to put this practice into a tool. It’s a local prototype today.
              The field notes share what I learn along the way.
            </p>
          </div>
          <div className="practice__card">
            <span className="eyebrow">{isPublished ? "Slow Feed · publishing" : "Slow Feed · in preparation"}</span>
            <p className="practice__card-title">
              {isPublished ? "Slow Feed is now publishing." : "The first field note is being written."}
            </p>
            <p className="practice__card-body">
              One conversation worth understanding, my own perspective, and what happened when I followed it.
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
