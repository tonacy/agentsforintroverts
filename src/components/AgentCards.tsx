import Image from "next/image";

const agents = [
  {
    name: "Inbox Agent",
    line: "Triages email, drafts replies, surfaces what matters.",
  },
  {
    name: "Follow-up Agent",
    line: "Tracks open threads, sends the nudge you won't.",
  },
  {
    name: "Scheduling Agent",
    line: "Protects focus blocks, handles the back-and-forth.",
  },
  {
    name: "Group Chat Agent",
    line: "Monitors channels, summarizes signal, drafts responses.",
  },
  {
    name: "Meetup Agent",
    line: "RSVPs, locations, the coordination you'd rather skip.",
  },
];

export function AgentCards() {
  return (
    <section className="border-t border-rule">
      <div className="mx-auto max-w-[900px] px-6 py-20 sm:py-28">
        <header className="mb-12">
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-ink-faint">
            The stack
          </p>
          <h2 className="mt-3 font-display text-3xl font-light tracking-tight text-ink sm:text-4xl">
            Five agents. Five types of work
            <br className="hidden sm:block" /> you no longer do yourself.
          </h2>
        </header>

        <ol className="space-y-0">
          {agents.map((agent, index) => (
            <li
              key={agent.name}
              className={`flex items-baseline gap-6 py-5 ${
                index !== agents.length - 1 ? "border-b border-rule-light" : ""
              }`}
            >
              <span className="font-body text-sm tabular-nums text-ink-faint w-6 shrink-0">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
                <h3 className="font-display text-lg text-ink sm:w-44 sm:shrink-0">
                  {agent.name}
                </h3>
                <p className="text-ink-muted">{agent.line}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-12 flex items-center gap-3 border-t border-rule pt-8">
          <Image
            src="/mark.png"
            alt=""
            width={32}
            height={32}
            className="w-8 h-8 opacity-60"
          />
          <p className="text-sm text-ink-faint">
            They handle the coordination. You stay in flow.
          </p>
        </div>
      </div>
    </section>
  );
}
