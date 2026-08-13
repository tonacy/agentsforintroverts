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
    <section className="bg-paper-warm px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-4xl">
        <header className="mb-16">
          <p className="text-sm font-medium uppercase tracking-widest text-ink-faint">
            Currently
          </p>
          <h2 className="mt-4 font-display text-4xl font-light tracking-tight text-ink sm:text-5xl">
            What I&apos;m building
          </h2>
        </header>

        <div className="grid gap-12 sm:grid-cols-3 sm:gap-8">
          {proofPoints.map((point, index) => (
            <article key={point.title} className="relative">
              <span className="font-display text-6xl font-light text-rule-strong absolute -top-4 -left-2 select-none">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="relative pt-8">
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
