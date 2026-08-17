const rooms = [
  {
    surface: "Email",
    role: "Inbox",
    status: "coming soon",
    highlighted: false,
  },
  {
    surface: "X",
    role: "holds the account",
    status: "coming soon",
    highlighted: false,
  },
  {
    surface: "Calendar",
    role: "Scheduling",
    status: "staffed",
    highlighted: false,
  },
  {
    surface: "LinkedIn",
    role: "—",
    status: "linkedin.com/in/tonyll",
    href: "https://linkedin.com/in/tonyll",
    highlighted: true,
  },
  {
    surface: "Substack",
    role: "newsletter",
    status: "not live yet",
    highlighted: false,
  },
];

export function TheFive() {
  return (
    <section id="the-rooms" className="border-t border-rule bg-paper-warm">
      <div className="mx-auto max-w-[1000px] px-6 py-16 sm:py-20">
        <h2 className="font-serif text-3xl leading-tight text-ink sm:text-4xl lg:text-5xl">
          The rooms.
          <br />
          Each one has someone in it.
        </h2>

        <div className="mt-12 divide-y divide-rule-light">
          {rooms.map((room) => (
            <div
              key={room.surface}
              className={`group grid gap-4 py-5 sm:grid-cols-[200px_1fr_1fr] sm:items-baseline ${
                room.highlighted
                  ? "relative -mx-4 px-4 sm:-mx-6 sm:px-6"
                  : ""
              }`}
            >
              {room.highlighted && (
                <div
                  className="absolute inset-0 bg-paper-warm pointer-events-none"
                  style={{ animation: "needs-breathe 8s ease-in-out infinite" }}
                  aria-hidden="true"
                />
              )}

              <span
                className={`relative font-serif text-lg ${
                  room.highlighted ? "text-ink" : "text-ink-muted"
                }`}
              >
                {room.surface}
              </span>

              <span
                className={`relative font-mono text-sm ${
                  room.highlighted ? "text-ink-muted" : "text-ink-faint"
                }`}
              >
                {room.role}
              </span>

              {room.href ? (
                <a
                  href={room.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative font-mono text-sm text-leaf hover:text-leaf-light transition-colors"
                >
                  {room.status}
                </a>
              ) : (
                <span
                  className={`relative font-mono text-sm ${
                    room.highlighted ? "text-ink" : "text-ink-faint"
                  }`}
                >
                  {room.status}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
