import Link from "next/link";

import { publishingChannels, updatesPublicationUrl } from "@/lib/site";
import { DeskShowcase } from "./DeskShowcase";

import "./practice.css";

/** The decision stays human; the next invitation is to follow the practice. */
export function Practice() {
  return (
    <>
      <section className="practice practice--forest" aria-labelledby="line-title">
        <div className="page-width practice__line">
          <div className="practice__line-lead">
            <span className="eyebrow">The human line</span>
            <h2 id="line-title">It still sounds like you.</h2>
            <p className="practice__line-quote">Your voice. Your say.</p>
          </div>
          <div className="practice__decision">
            <p>
              The team works from what you’re actually making, thinking, and learning.
              You shape the point of view and choose what goes out, where it goes, and
              how much the agents handle.
            </p>
            <p>
              A thought can stay private. A draft can wait. The work you share should
              feel like something you mean.
            </p>
            <Link className="practice__belief" href="/manifesto/">Read the manifesto →</Link>
            <Link className="practice__authorship" href="/made-with/">How authorship works ↗</Link>
          </div>
        </div>
      </section>

      <DeskShowcase />

      <section className="practice practice--sage" id="field-notes" aria-labelledby="follow-title">
        <div className="page-width practice__follow">
          <div className="practice__stack">
            <span className="eyebrow">Follow along</span>
            <h2 id="follow-title">See what takes shape.</h2>
            <p className="practice__intro">
              Updates on what we’re building, what we’re sharing, and where it leads.
              Get them by email, or follow the work out in the world.
            </p>
            <nav className="practice__channels" aria-label="Follow Tony’s work">
              {publishingChannels.map(({ label, href }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer">
                  {label} <span aria-hidden="true">↗</span>
                </a>
              ))}
            </nav>
            <p className="practice__note">Quiet Desk is a local prototype. These are the field notes as it grows.</p>
          </div>
          <div className="practice__signup">
            <iframe
              className="practice__subscribe"
              src={`${updatesPublicationUrl}/embed`}
              title="Subscribe to Agents for Introverts updates"
              width="480"
              height="360"
              loading="lazy"
            />
            <a className="practice__subscribe-fallback" href={`${updatesPublicationUrl}/subscribe`}>
              Open signup on Substack ↗
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
