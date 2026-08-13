const agents = [
  {
    name: "Inbox",
    description: "Sorts the correspondence, drafts replies, surfaces what matters.",
  },
  {
    name: "Follow-up",
    description: "Tracks open threads, sends the note you'd rather not.",
  },
  {
    name: "Scheduling",
    description: "Guards your calendar, handles the back-and-forth.",
  },
  {
    name: "Group chat",
    description: "Monitors the room, summarizes signal, drafts responses.",
  },
  {
    name: "Meetup",
    description: "RSVPs, invitations, the coordination you'd rather skip.",
  },
];

export function TheFive() {
  return (
    <section id="the-five" className="border-t border-rule bg-paper-warm">
      <div className="mx-auto max-w-[1000px] px-6 py-16 sm:py-20">
        <h2 className="font-serif text-2xl text-ink sm:text-3xl">
          The five, plainly
        </h2>
        <p className="mt-3 font-serif text-ink-muted">
          You just watched them work. Here they are.
        </p>

        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {agents.map((agent, index) => (
            <li key={agent.name} className="flex flex-col">
              <span className="font-mono text-xs text-ink-faint">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="mt-1 font-serif text-lg text-ink">
                {agent.name}
              </span>
              <span className="mt-2 text-sm text-ink-muted leading-relaxed">
                {agent.description}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
