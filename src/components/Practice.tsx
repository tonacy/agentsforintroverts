import { publishingChannels, updatesPublicationUrl } from "@/lib/site";

import "./practice.css";

/** After the story: an invitation to follow the practice as it grows. */
export function Practice() {
  return (
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
  );
}
