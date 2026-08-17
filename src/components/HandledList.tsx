const handledThreads = [
  {
    time: "07:12",
    sender: "Maya Rendell",
    quote: '"Can you speak at the September meetup?"',
    label: "Meetup",
    action: "Declined warmly. Offered a written Q&A instead — she said yes.",
    highlighted: false,
  },
  {
    time: "09:05",
    sender: "#build-eng · 41 msgs",
    quote: '"so are we shipping Friday..."',
    label: "Group chat",
    action: "They landed on Monday without you.",
    highlighted: false,
  },
  {
    time: "09:31",
    sender: "Ben Okonkwo",
    quote: "Thread cold since June 2nd.",
    label: "Follow-up",
    action: "The note you'd rather not send, sent.",
    highlighted: false,
  },
  {
    time: "11:02",
    sender: "Priya Shah",
    quote: '"Free for a quick call Thursday morning?"',
    label: "Scheduling",
    action: "Moved to Tuesday 14:00.",
    highlighted: false,
  },
  {
    time: "12:40",
    sender: "7 senders",
    quote: "Newsletters, an invoice, two intros...",
    label: "Inbox",
    action: "Filed, drafted, batched. Digest at 17:00.",
    highlighted: false,
  },
  {
    time: "13:04",
    sender: "Anna Vogel",
    quote: '"We\'d like to make you an offer. Can we talk properly?"',
    label: "Needs you",
    action: "Held open, unanswered, deliberately. Some rooms you walk into yourself.",
    highlighted: true,
  },
];

export function HandledList() {
  return (
    <section className="border-t border-rule">
      <div className="mx-auto max-w-[1000px] px-6 py-12">
        <div className="flex items-baseline justify-between border-b border-rule pb-4">
          <p className="font-mono text-xs uppercase tracking-wider text-ink-faint">
            Today · handled for you
          </p>
          <p className="font-mono text-xs uppercase tracking-wider text-ink-faint">
            11 threads · 0 asks
          </p>
        </div>

        <div className="divide-y divide-rule-light">
          {handledThreads.map((thread) => (
            <div
              key={thread.time + thread.sender}
              className={`group grid gap-4 py-5 sm:grid-cols-[60px_140px_1fr_100px_1fr] sm:items-baseline transition-colors ${
                thread.highlighted 
                  ? "relative -mx-4 px-4 sm:-mx-6 sm:px-6" 
                  : ""
              }`}
            >
              {/* Needs-you row background wash with breathing animation */}
              {thread.highlighted && (
                <div 
                  className="absolute inset-0 bg-paper-warm pointer-events-none"
                  style={{ animation: 'needs-breathe 8s ease-in-out infinite' }}
                  aria-hidden="true"
                />
              )}
              
              {/* Time - muted for handled rows, leaf for needs-you */}
              <span className={`relative font-mono text-sm ${
                thread.highlighted ? "text-leaf font-medium" : "text-ink-faint"
              }`}>
                {thread.time}
              </span>
              
              {/* Sender - full ink for needs-you, muted for handled */}
              <span className={`relative font-serif ${
                thread.highlighted ? "text-ink text-lg" : "text-ink-muted"
              }`}>
                {thread.sender}
              </span>
              
              {/* Quote - always italic, full ink for needs-you */}
              <span className={`relative font-serif italic ${
                thread.highlighted ? "text-ink" : "text-ink-faint"
              }`}>
                {thread.quote}
              </span>
              
              {/* Label - leaf ONLY for needs-you, gray mono for others */}
              <span className={`relative font-mono text-xs uppercase tracking-wider ${
                thread.highlighted ? "text-leaf font-medium" : "text-tag-muted"
              }`}>
                {thread.label}
              </span>
              
              {/* Action - leaf for needs-you, muted for handled with hover darkening */}
              <span className={`relative font-serif italic ${
                thread.highlighted 
                  ? "text-leaf" 
                  : "text-ink-faint group-hover:text-ink-muted transition-colors"
              }`}>
                {thread.action}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
