const audiences = [
  "Founders who build more than they broadcast",
  "Developers who hate context-switching for coordination",
  "Creators who need deep work protected",
  "Anyone who finds social logistics draining",
];

export function Audience() {
  return (
    <section className="border-t border-rule bg-paper-warm">
      <div className="mx-auto max-w-[900px] px-6 py-20 sm:py-24">
        <div className="grid gap-8 lg:grid-cols-[200px_1fr] lg:gap-16">
          <header>
            <p className="text-xs font-medium uppercase tracking-[0.15em] text-ink-faint">
              For you if
            </p>
            <h2 className="mt-3 font-display text-2xl font-light tracking-tight text-ink sm:text-3xl">
              Who this is for
            </h2>
          </header>

          <ul className="space-y-0">
            {audiences.map((audience, index) => (
              <li
                key={audience}
                className={`flex items-baseline gap-4 py-4 ${
                  index !== audiences.length - 1
                    ? "border-b border-rule-light"
                    : ""
                }`}
              >
                <span className="text-leaf text-xs">●</span>
                <span className="text-ink-muted">{audience}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
