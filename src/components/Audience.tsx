const audiences = [
  "Founders who'd rather build than network",
  "Developers who hate context-switching to coordinate",
  "Creators who need deep work time protected",
  "Anyone who finds social logistics draining",
  "People who want systems, not more effort",
];

export function Audience() {
  return (
    <section className="bg-stone-900/50 px-6 py-24">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-stone-100 sm:text-4xl">
          Who this is for
        </h2>
        <p className="mt-4 text-lg text-stone-400">
          If any of these sound like you, you&apos;re in the right place.
        </p>

        <ul className="mt-12 space-y-4 text-left">
          {audiences.map((audience) => (
            <li
              key={audience}
              className="flex items-center gap-4 rounded-lg border border-stone-800/50 bg-stone-900/30 px-6 py-4"
            >
              <svg
                className="h-5 w-5 shrink-0 text-teal-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="text-stone-300">{audience}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
