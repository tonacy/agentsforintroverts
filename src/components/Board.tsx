import Image from "next/image";

import { SKETCH_ARROW, SKETCH_COLUMNS, SKETCH_PAGE, WAVE } from "@/lib/desk-art";

/**
 * The paper on the desk during the opening passage: loose pages from a day's
 * work, the piece they become, the agent's margin notes, your mark, and the
 * forms the piece takes when it leaves. All of it is decoration for the
 * headlines, so it stays out of the accessibility tree.
 *
 * Positions come from `BOARDS` in lib/passage; this file only draws.
 */


export const NOTE_TAGS = [
  "↳ your words, from the voice note",
  "↳ figure redrawn from your sketch",
  "↳ from commit a71f053",
  "↳ source kept: MDN",
] as const;

export const FORM_LABELS = ["essay · your site", "post · LinkedIn", "card · X"] as const;

/** What comes back to each form: people answering, among the feed. */
export const ARRIVALS = [
  "a question · about your essay",
  "a reply · from someone building the same thing",
  "an invitation · to talk it through",
] as const;

function Signature() {
  return (
    <svg className="sheet__signature" viewBox="0 0 150 40" fill="none" aria-hidden="true">
      <path
        data-obj="signature"
        pathLength={1}
        d="M4 30c6-9 11-22 16-22 4 0-3 21 1 21 5 0 9-16 13-16 3 0-1 13 3 13 4 0 7-9 11-9 3 0 1 8 5 8 6 0 10-14 16-14 3 0 2 10 6 10 5 0 8-6 13-6 4 0 3 5 7 5 8 0 20-8 51-10"
      />
    </svg>
  );
}

export function Board() {
  return (
    <div className="board" aria-hidden="true">
      <div className="obj form form--post" data-obj="post">
        <div className="post__who">
          <span className="post__avatar" />
          <span className="post__name">
            <b>You</b>
            <i>just now</i>
          </span>
        </div>
        <p>
          The Agents for Introverts home page opens on a sea of feed fragments. It moves the way a feed
          does. Then it slows down, and only as fast as you scroll.
        </p>
        <p className="post__more">…see more</p>
        <div className="post__link">
          <span>Why this page slows down</span>
          <i>agentsforintroverts.com</i>
        </div>
      </div>

      <div className="obj form form--card" data-obj="card">
        <div className="card__plate">
          <span className="card__kicker">From the workbench</span>
          <span className="card__title">
            Why this page <em>slows down</em>
          </span>
          <span className="card__brand">
            <Image src="/brand/drifting-page-mark.png" alt="" width={36} height={36} />
            Agents for Introverts
          </span>
        </div>
      </div>

      <article className="obj sheet" data-obj="page">
        <div className="sheet__head" data-part="title">
          <span>From the workbench</span>
          <span>No. 001</span>
        </div>
        <p className="sheet__title" data-part="title">
          Why this page <em>slows down</em>
        </p>
        <p className="sheet__deck" data-part="deck">
          It starts at the speed of a feed and settles at the speed of reading.
        </p>
        <div className="sheet__plate" data-part="figure">
          <Image src="/illustrations/specimen-figure.svg" alt="" width={1600} height={900} />
        </div>
        <div className="sheet__body" data-part="body">
          <p>
            <b>I</b>t opens on a sea of fragments: an email reply, a calendar ask, a mention, a thread
            you were added to. They stream past the way a feed does.
          </p>
          <p>
            Scrolling parts the sea and slows it. The motion is scrubbed by scroll, never timed, so it
            cannot run ahead of the person reading.<sup>1</sup>
          </p>
        </div>
        <footer className="sheet__colophon" data-part="colophon">
          <span className="sheet__made">
            Made with agents.
            <br />
            The point of view is yours.
          </span>
          <span className="sheet__sign">
            <Signature />
            <span className="sheet__chop" data-obj="chop">
              <Image src="/brand/drifting-page-mark.png" alt="" width={48} height={48} />
            </span>
          </span>
        </footer>
      </article>

      <div className="obj loose loose--voice" data-obj="voice">
        <div className="loose__label">
          <span className="loose__rec" />
          Voice note · 0:48
        </div>
        <div className="loose__wave">
          {WAVE.map((h, i) => (
            <i key={i} style={{ height: h }} />
          ))}
        </div>
        <p className="loose__words">“What if the page starts fast, and slows down as you read?”</p>
      </div>

      <div className="obj loose loose--commit" data-obj="commit">
        <span className="commit__hash">a71f053</span>
        <span className="commit__msg">Rebuild the home page as a scroll-driven crossing over a live sea</span>
      </div>

      <div className="obj loose loose--sketch" data-obj="sketch">
        <svg viewBox="0 0 230 180" fill="none">
          {SKETCH_COLUMNS.map((column) => (
            <path key={column.path} d={column.path} strokeDasharray={column.dash.join(" ")} />
          ))}
          <path className="sketch__page" d={SKETCH_PAGE} />
          <path className="sketch__arrow" d={SKETCH_ARROW} />
          <text x="118" y="44">slower here</text>
        </svg>
      </div>

      <div className="obj loose loose--note" data-obj="note">
        <span className="note__tape" />
        <p>what if the sea parts wherever you look?</p>
      </div>

      <div className="obj loose loose--link" data-obj="link">
        <div className="link__bar">
          <i />
          <i />
          <i />
          <span>developer.mozilla.org</span>
        </div>
        <p className="link__title">prefers-reduced-motion</p>
        <p className="link__text">Detects whether a visitor has asked to minimize non-essential motion.</p>
      </div>

      {NOTE_TAGS.map((tag, i) => (
        <p className="obj note-tag" data-obj={`note-${i}`} key={tag}>
          {tag}
        </p>
      ))}

      {FORM_LABELS.map((label, i) => (
        <span className="obj form-label" data-obj={`label-${i}`} key={label}>
          {label}
        </span>
      ))}

      {ARRIVALS.map((line, i) => (
        <span className="obj arrival" data-obj={`arrival-${i}`} key={line}>
          {line}
        </span>
      ))}
    </div>
  );
}
