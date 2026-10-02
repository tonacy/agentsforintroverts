import Image from "next/image";

import "./desk-showcase.css";

const STEPS = [
  {
    title: "Loose pages",
    text: "A note, a link, a screenshot, the moment it happens. Kept in your words, from the desk or the menu bar.",
  },
  {
    title: "Pieces",
    text: "The essay, each post and each card, set in one house style and read the way their readers will meet them.",
  },
  {
    title: "Your mark",
    text: "It still sounds like you because nothing leaves without it. A signature covers one exact form; change a word and it comes off.",
  },
] as const;

/** The Mac app the opening describes: where the loop actually happens, and where your mark goes on. */
export function DeskShowcase() {
  return (
    <section className="desk-show" aria-labelledby="desk-title">
      <div className="page-width desk-show__grid">
        <div className="desk-show__copy">
          <p className="eyebrow">Quiet Desk · for Mac</p>
          <h2 id="desk-title">Where the loop lives.</h2>
          <p className="desk-show__lead">
            Your part is the small part, and the deciding one. Put things on the desk as they happen,
            talk them through, and sign what’s ready. A thought can stay private; a draft can wait.
            Your agents do the writing, a version for each place, and the images.
          </p>
          <ol className="desk-show__steps">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <span className="desk-show__n" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
          <p className="desk-show__note">
            A local prototype. It never posts for you: you publish, and it keeps the link as a receipt.
          </p>
        </div>
        <div className="desk-show__stage">
          <Image
            className="desk-show__shot desk-show__shot--desk"
            src="/illustrations/quiet-desk-desk.webp"
            alt="Quiet Desk showing loose pages and pieces on the desk, each signed piece carrying a small red mark."
            width={1600}
            height={1204}
            sizes="(max-width: 899px) 100vw, 58vw"
          />
          <Image
            className="desk-show__shot desk-show__shot--studio"
            src="/illustrations/quiet-desk-studio.webp"
            alt="A LinkedIn draft in the piece studio, with the feed's fold marked in red beside the person's signature."
            width={1400}
            height={905}
            sizes="(max-width: 899px) 90vw, 40vw"
          />
        </div>
      </div>
    </section>
  );
}
