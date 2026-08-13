import Image from "next/image";

const agents = [
  {
    name: "Inbox Agent",
    line: "Sorts the correspondence, drafts replies, surfaces what matters.",
    image: "/agents/01-inbox.png",
  },
  {
    name: "Follow-up Agent",
    line: "Tracks open threads, sends the note you'd rather not.",
    image: "/agents/02-follow-up.png",
  },
  {
    name: "Scheduling Agent",
    line: "Guards your calendar, handles the back-and-forth.",
    image: "/agents/03-scheduling.png",
  },
  {
    name: "Group Chat Agent",
    line: "Monitors the room, summarizes signal, drafts responses.",
    image: "/agents/04-group-chat.png",
  },
  {
    name: "Meetup Agent",
    line: "RSVPs, invitations, the coordination you'd rather skip.",
    image: "/agents/05-meetup.png",
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
              className={`flex items-center gap-5 py-6 ${
                index !== agents.length - 1 ? "border-b border-rule-light" : ""
              }`}
            >
              <span className="font-body text-sm tabular-nums text-ink-faint w-6 shrink-0 self-start pt-1">
                {String(index + 1).padStart(2, "0")}
              </span>
              <Image
                src={agent.image}
                alt=""
                width={56}
                height={56}
                className="w-14 h-14 shrink-0 object-contain"
              />
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4 min-w-0">
                <h3 className="font-display text-lg text-ink sm:w-40 sm:shrink-0">
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
            Your social secretary handles the correspondence. You stay in flow.
          </p>
        </div>
      </div>
    </section>
  );
}
