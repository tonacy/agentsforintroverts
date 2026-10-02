import Image from "next/image";
import Link from "next/link";

import "./piece-reveal.css";

/** The specimen's LinkedIn adaptation, as far as the feed shows it before “…see more”. */
const POST_ABOVE_THE_FOLD =
  "The Agents for Introverts home page opens on a sea of feed fragments: a reply, an ask, a mention, a thread you were added to. It moves the way a feed does.";

/**
 * The piece the opening shows being made, as its readers would meet it. The
 * essay and the card are the house renderer's own output for the specimen in
 * templates/quiet-desk-publishing/piece/specimen; the post is set from that
 * specimen's LinkedIn adaptation. Who did what comes from its ledger.
 */
export function PieceReveal() {
  return (
    <section className="reveal" id="the-piece" aria-labelledby="reveal-title">
      <div className="page-width reveal__grid">
        <div className="reveal__copy">
          <p className="eyebrow">The piece</p>
          <h2 id="reveal-title">You just watched one come together.</h2>
          <p className="reveal__lead">
            Here it is as its readers would meet it: the essay for your site, a post for LinkedIn, a
            card for X. One idea in one house style, each form shaped for where it goes.
          </p>
          <dl className="reveal__ledger">
            <div>
              <dt>You</dt>
              <dd>The idea of a feed that slows. The choice to make rest the default.</dd>
            </div>
            <div>
              <dt>Your agents</dt>
              <dd>Set the words from your notes, drew the figure, and adapted it for LinkedIn and X.</dd>
            </div>
          </dl>
          <p className="reveal__note">
            A house-style specimen, so it is unsigned and has gone nowhere. In Quiet Desk, each form
            waits for your mark.
          </p>
          <Link className="reveal__link" href="/made-with/">
            How authorship works →
          </Link>
        </div>

        <div className="reveal__forms">
          <figure className="reveal__form reveal__form--essay">
            <Image
              src="/illustrations/piece-essay.webp"
              alt="The essay set in the house style: “Why this page slows down”, its deck, a short list of contents, and a figure of a fast feed slowing to a page at rest."
              width={1200}
              height={1592}
              sizes="(max-width: 899px) 100vw, 34vw"
            />
            <figcaption>essay · your site</figcaption>
          </figure>
          <figure className="reveal__form reveal__form--post">
            <div className="reveal__post">
              <div className="reveal__post-who">
                <span className="reveal__avatar" aria-hidden="true">
                  Y
                </span>
                <span>
                  <b>You</b>
                  <i>a draft, not posted</i>
                </span>
              </div>
              <p>{POST_ABOVE_THE_FOLD}</p>
              <p className="reveal__fold">…see more</p>
            </div>
            <figcaption>post · LinkedIn</figcaption>
          </figure>
          <figure className="reveal__form reveal__form--card">
            <Image
              src="/illustrations/piece-card.webp"
              alt="A square card for X: “Why this page slows down”, from the workbench, made with agents."
              width={1000}
              height={1000}
              sizes="(max-width: 899px) 70vw, 20vw"
            />
            <figcaption>card · X</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
