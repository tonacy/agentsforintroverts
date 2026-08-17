import { EmailForm } from "./EmailForm";

const gutterTicks = [
  { time: "07:12", text: "meetup declined" },
  { time: "09:31", text: "follow-up sent" },
  { time: "10:14", text: "41 msgs → 2 lines" },
  { time: "11:02", text: "Thu morning held" },
  { time: "12:40", text: "digest queued" },
];

export function Hero() {
  return (
    <section className="relative pt-12 pb-16 sm:pt-16 sm:pb-20 overflow-hidden">
      <div className="mx-auto max-w-[1000px] min-[1100px]:max-w-[1148px] px-6">
        <div className="grid gap-12 lg:grid-cols-[1fr_300px] lg:gap-16 min-[1100px]:grid-cols-[1fr_300px_148px]">
          {/* Headline column */}
          <div className="relative">
            {/* Sun wash - radial gradient behind headline */}
            <div 
              className="absolute -top-8 -left-16 w-[500px] h-[400px] pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse 70% 60% at 30% 40%, var(--color-sun) 0%, transparent 70%)',
                animation: 'sun-breathe 12s ease-in-out infinite',
              }}
              aria-hidden="true"
            />
            
            <p className="relative font-mono text-sm uppercase tracking-wider text-leaf">
              Tuesday, 13:04
            </p>
            <h1 className="relative mt-4 font-serif text-5xl leading-[1.1] tracking-tight text-ink sm:text-6xl lg:text-7xl">
              I have<br />
              <span 
                className="inline-block"
                style={{ animation: 'zero-fade 500ms ease-out 200ms forwards', opacity: 0 }}
              >
                0
              </span> unread.
            </h1>
            <p className="relative mt-8 max-w-[480px] font-serif text-xl leading-relaxed text-ink-muted sm:text-2xl">
              Eleven things were handled while I was writing. One of them is worth my attention.
            </p>
          </div>

          {/* CTA column */}
          <div id="playbook" className="lg:pt-8">
            <p className="font-serif text-ink-muted leading-relaxed">
              I run a stack of five AI agents as my social secretary — they handle correspondence, calendars, RSVPs, and the room. This is how I stay in flow.
            </p>
            <div className="mt-6 border-t border-rule pt-6">
              <EmailForm />
              <p className="mt-3 font-mono text-xs text-ink-faint">
                Free — The Quiet Operator&apos;s Agent Stack. Five setups, no spam.
              </p>
            </div>
          </div>

          {/* Gutter ticks column - hidden below 1100px */}
          <div className="hidden min-[1100px]:block font-mono text-[11px] text-ink-faint leading-relaxed pt-8">
            {gutterTicks.slice(0, -1).map((tick) => (
              <div key={tick.time} className="mb-2 text-right opacity-60">
                <span>{tick.time}</span>
                <span className="ml-2">{tick.text}</span>
              </div>
            ))}
            <div className="mb-2 text-right">
              <span className="opacity-60">{gutterTicks[gutterTicks.length - 1].time}</span>
              <span 
                className="ml-2 inline-block overflow-hidden whitespace-nowrap border-r border-transparent opacity-60"
                style={{
                  animation: 'tick-type 2.5s steps(14, end) forwards, tick-cursor 2.5s step-end forwards',
                }}
              >
                {gutterTicks[gutterTicks.length - 1].text}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
