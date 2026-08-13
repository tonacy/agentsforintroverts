const agents = [
  {
    glyph: "envelope",
    name: "Inbox Agent",
    scene: "7:42 AM — Rain on the window. The inbox agent is already three deep in your email, flagging what matters, archiving the noise.",
    action: "Triages, drafts replies, surfaces urgency.",
  },
  {
    glyph: "clock",
    name: "Follow-up Agent",
    scene: "Tuesday, somewhere in the city. A conversation went cold. The follow-up agent sends a gentle nudge you'd never send yourself.",
    action: "Tracks threads, handles the persistence.",
  },
  {
    glyph: "calendar",
    name: "Scheduling Agent",
    scene: "Back-and-forth #7. Someone wants 'sometime next week.' The scheduling agent negotiates while you stay in flow.",
    action: "Protects focus blocks, handles timezone math.",
  },
  {
    glyph: "message",
    name: "Group Chat Agent",
    scene: "247 unread in Slack. The group chat agent reads it all, summarizes the signal, drafts your reply.",
    action: "Monitors channels, flags mentions, drafts responses.",
  },
  {
    glyph: "map",
    name: "Meetup Agent",
    scene: "Friday, 6 PM. Eight people, three preferences, one reservation. The meetup agent handled the choreography while you coded.",
    action: "RSVPs, locations, the social logistics.",
  },
];

function AgentGlyph({ type }: { type: string }) {
  const glyphs: Record<string, React.ReactNode> = {
    envelope: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M22 6L12 13 2 6" />
      </svg>
    ),
    clock: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
    calendar: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
    message: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
        <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
      </svg>
    ),
    map: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  };
  return <span className="text-navy">{glyphs[type]}</span>;
}

export function AgentCards() {
  return (
    <section className="section-outside relative px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-4xl">
        <header className="mb-16">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-outside">
            Dispatches from outside
          </p>
          <h2 className="mt-4 font-display text-4xl font-light tracking-tight text-street sm:text-5xl">
            Five agents. Five types of work<br className="hidden sm:block" /> you no longer do yourself.
          </h2>
          <p className="mt-6 max-w-2xl text-lg text-outside leading-relaxed">
            Each one handles a different kind of social coordination — 
            the kind that pulls you out of the cave.
          </p>
        </header>

        <ol className="space-y-0">
          {agents.map((agent, index) => (
            <li
              key={agent.name}
              className={`group py-8 ${
                index !== agents.length - 1 ? "border-b border-rain/20" : ""
              }`}
            >
              <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:gap-6">
                {/* Glyph */}
                <div className="flex items-start gap-3 sm:flex-col sm:items-center sm:pt-1">
                  <AgentGlyph type={agent.glyph} />
                </div>

                {/* Content */}
                <div className="space-y-3">
                  <h3 className="font-display text-xl font-normal text-street sm:text-2xl">
                    {agent.name}
                  </h3>
                  <p className="font-display text-base italic text-outside leading-relaxed">
                    &ldquo;{agent.scene}&rdquo;
                  </p>
                  <p className="text-sm text-rain uppercase tracking-wide">
                    {agent.action}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>

        {/* Visual break - return to warmth */}
        <div className="mt-16 pt-8 border-t border-rain/20 text-center">
          <p className="font-display text-lg italic text-outside">
            Meanwhile, you&apos;re still inside. Coffee&apos;s warm.
          </p>
        </div>
      </div>
    </section>
  );
}
