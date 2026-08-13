const audiences = [
  "Founders who'd rather build than network",
  "Developers who hate context-switching to coordinate",
  "Creators who need deep work time protected",
  "Anyone who finds social logistics draining",
  "People who want systems, not more effort",
];

export function Audience() {
  return (
    <section className="border-t border-rule px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-4xl">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.5fr] lg:gap-16">
          <header>
            <p className="text-sm font-medium uppercase tracking-widest text-ink-faint">
              For you if
            </p>
            <h2 className="mt-4 font-display text-4xl font-light tracking-tight text-ink sm:text-5xl">
              Who this is for
            </h2>
            <p className="mt-6 text-lg text-ink-muted leading-relaxed">
              If any of these sound like you, you&apos;re in the right place.
            </p>
          </header>

          <ul className="space-y-0">
            {audiences.map((audience, index) => (
              <li
                key={audience}
                className={`flex items-baseline gap-4 py-5 ${
                  index !== audiences.length - 1 ? "border-b border-rule" : ""
                }`}
              >
                <span className="text-ember text-lg">→</span>
                <span className="text-lg text-ink">{audience}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
