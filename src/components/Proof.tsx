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
    <section className="px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-stone-100 sm:text-4xl">
            What I&apos;m building
          </h2>
          <p className="mt-4 text-lg text-stone-400">
            Real projects, real agent setups, real results.
          </p>
        </div>

        <div className="mt-16 grid gap-8 sm:grid-cols-3">
          {proofPoints.map((point) => (
            <div
              key={point.title}
              className="relative border-l-2 border-teal-600/30 pl-6"
            >
              <div className="absolute -left-[5px] top-0 h-2 w-2 rounded-full bg-teal-500" />
              <h3 className="text-lg font-semibold text-stone-100">
                {point.title}
              </h3>
              <p className="mt-2 text-stone-400 leading-relaxed">
                {point.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
