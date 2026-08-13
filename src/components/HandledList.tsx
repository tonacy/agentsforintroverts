const handledThreads = [
  {
    time: "07:12",
    sender: "Maya Rendell",
    quote: '"Can you speak at the September meetup? 15 min, very casual."',
    label: "Meetup",
    action: "Declined warmly. Offered a written Q&A instead — she said yes.",
    highlighted: false,
  },
  {
    time: "09:05",
    sender: "#build-eng · 41 msgs",
    quote: '"so are we shipping Friday or slipping to Monday??"',
    label: "Group chat",
    action: "They landed on Monday without you. Two lines, read later.",
    highlighted: false,
  },
  {
    time: "09:31",
    sender: "Ben Okonkwo",
    quote: "Thread cold since June 2nd. You meant to reply. You didn't.",
    label: "Follow-up",
    action: "The note you'd rather not send, sent. In your voice, not a robot's.",
    highlighted: false,
  },
  {
    time: "11:02",
    sender: "Priya Shah",
    quote: '"Free for a quick call Thursday morning?"',
    label: "Scheduling",
    action: "Moved to Tuesday 14:00. Thursday morning is yours and it knows it.",
    highlighted: false,
  },
  {
    time: "12:40",
    sender: "7 senders",
    quote: "Newsletters, an invoice, two intros, a calendar invite you'd have opened.",
    label: "Inbox",
    action: "Filed, drafted, batched. One digest waits at 17:00. Six minutes long.",
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
              className={`grid gap-4 py-5 sm:grid-cols-[60px_140px_1fr_100px_1fr] sm:items-baseline ${
                thread.highlighted ? "bg-highlight -mx-4 px-4 sm:-mx-6 sm:px-6" : ""
              }`}
            >
              <span className="font-mono text-sm text-ink-faint">
                {thread.time}
              </span>
              <span className="font-serif text-ink">
                {thread.sender}
              </span>
              <span className="font-serif text-ink-muted italic">
                {thread.quote}
              </span>
              <span className={`font-mono text-xs uppercase tracking-wider ${
                thread.highlighted ? "text-leaf" : "text-leaf"
              }`}>
                {thread.label}
              </span>
              <span className={`font-serif italic ${
                thread.highlighted ? "text-ink font-medium" : "text-ink-muted"
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
