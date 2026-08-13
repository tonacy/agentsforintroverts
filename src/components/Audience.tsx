const conditions = [
  "You've reread a two-sentence email four times before sending it.",
  "Your best work happens in the four hours nobody schedules over.",
  "You'd ship more if coordinating cost you nothing.",
];

export function Audience() {
  return (
    <section id="who-its-for" className="border-t border-rule">
      <div className="mx-auto max-w-[1000px] px-6 py-16 sm:py-20">
        <h2 className="font-serif text-3xl text-ink sm:text-4xl lg:text-5xl">
          Say yes if
        </h2>

        <ul className="mt-10 space-y-6">
          {conditions.map((condition) => (
            <li
              key={condition}
              className="flex items-start gap-4 font-serif text-xl text-ink-muted leading-relaxed sm:text-2xl"
            >
              <span className="mt-2 text-leaf text-sm">—</span>
              <span>{condition}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
