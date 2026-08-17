import { EmailForm } from "./EmailForm";

const doors = [
  { surface: "email", status: "soon" },
  { surface: "X", status: "soon" },
  { surface: "calendar", status: "staffed" },
  { surface: "linkedin.com/in/tonyll", status: null, href: "https://linkedin.com/in/tonyll" },
  { surface: "substack", status: "not live" },
];

export function Hero() {
  return (
    <section className="relative pt-12 pb-16 sm:pt-16 sm:pb-20 overflow-hidden">
      <div className="mx-auto max-w-[1000px] min-[1100px]:max-w-[1168px] px-6">
        <div className="grid gap-12 lg:grid-cols-[1fr_300px] lg:gap-16 min-[1100px]:grid-cols-[1fr_300px_168px]">
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
            <p className="mt-6 font-serif text-ink-muted italic leading-relaxed">
              Your best work happens in the four hours nobody schedules over.
            </p>
            {/* LinkedIn link visible below 1100px when gutter is hidden */}
            <a
              href="https://linkedin.com/in/tonyll"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 block min-[1100px]:hidden font-mono text-sm text-leaf hover:text-leaf-light transition-colors"
            >
              linkedin.com/in/tonyll
            </a>
          </div>

          {/* Doors gutter column - hidden below 1100px */}
          <div className="hidden min-[1100px]:block font-mono text-[11px] text-ink-faint leading-relaxed pt-8">
            {doors.map((door) => (
              <div key={door.surface} className="mb-2 text-right">
                {door.href ? (
                  <a
                    href={door.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-leaf hover:text-leaf-light transition-colors"
                  >
                    {door.surface}
                  </a>
                ) : (
                  <span className="opacity-60">
                    {door.surface}
                    <span className="mx-1">·</span>
                    {door.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
