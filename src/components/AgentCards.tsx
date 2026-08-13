const agents = [
  {
    number: "01",
    name: "Inbox Agent",
    line: "Triages your email, surfaces what matters, drafts replies you can send with one click.",
  },
  {
    number: "02",
    name: "Follow-up Agent",
    line: "Tracks conversations that need a nudge and handles the gentle persistence you don't have bandwidth for.",
  },
  {
    number: "03",
    name: "Scheduling Agent",
    line: "Negotiates meeting times, handles the back-and-forth, and protects your focus blocks from calendar creep.",
  },
  {
    number: "04",
    name: "Group Chat Agent",
    line: "Monitors Slack, Discord, and group chats. Summarizes threads, flags mentions, drafts responses.",
  },
  {
    number: "05",
    name: "Meetup Logistics Agent",
    line: "Handles RSVPs, location coordination, and the social choreography of getting people together.",
  },
];

export function AgentCards() {
  return (
    <section className="border-t border-rule px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-4xl">
        <header className="mb-20">
          <p className="text-sm font-medium uppercase tracking-widest text-ink-faint">
            The Stack
          </p>
          <h2 className="mt-4 font-display text-4xl font-light tracking-tight text-ink sm:text-5xl">
            Five agents. Five types of social<br className="hidden sm:block" /> coordination you no longer do yourself.
          </h2>
        </header>

        <ol className="space-y-0">
          {agents.map((agent, index) => (
            <li
              key={agent.number}
              className={`group grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 py-8 sm:grid-cols-[4rem_12rem_1fr] sm:items-baseline sm:gap-x-8 ${
                index !== agents.length - 1 ? "border-b border-rule" : ""
              }`}
            >
              <span className="font-display text-3xl font-light text-ink-faint sm:text-4xl">
                {agent.number}
              </span>
              <h3 className="font-display text-2xl font-normal text-ink sm:text-3xl">
                {agent.name}
              </h3>
              <p className="col-span-2 text-lg leading-relaxed text-ink-muted sm:col-span-1">
                {agent.line}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
