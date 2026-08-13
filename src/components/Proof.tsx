const proofPoints = [
  {
    title: "iMessage AI Agent",
    description:
      "Built an AI agent that lives in iMessage — handling text-based coordination without leaving the conversation.",
  },
  {
    title: "OpenClaw",
    description:
      "Building tools and systems for people who prefer shipping to schmoozing.",
  },
  {
    title: "Austin Meetups",
    description:
      "Running builder gatherings in Austin — ironically, using agents to handle the logistics.",
  },
];

export function Proof() {
  return (
    <section className="section-interior relative px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-4xl relative z-10">
        <header className="mb-16">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-camel-muted">
            Currently building
          </p>
          <h2 className="mt-4 font-display text-4xl font-light tracking-tight text-ink sm:text-5xl">
            What I&apos;m working on
          </h2>
        </header>

        <div className="grid gap-12 sm:grid-cols-3 sm:gap-8">
          {proofPoints.map((point, index) => (
            <article key={point.title} className="relative group">
              {/* Decorative number */}
              <span className="font-display text-6xl font-light text-rule-warm absolute -top-4 -left-2 select-none opacity-60">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="relative pt-10 pl-1">
                <h3 className="font-display text-xl font-normal text-ink">
                  {point.title}
                </h3>
                <p className="mt-3 text-ink-muted leading-relaxed">
                  {point.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
