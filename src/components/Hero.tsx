import { EmailForm } from "./EmailForm";

export function Hero() {
  return (
    <section className="pt-12 pb-16 sm:pt-16 sm:pb-20">
      <div className="mx-auto max-w-[1000px] px-6">
        <div className="grid gap-12 lg:grid-cols-[1fr_340px] lg:gap-16">
          <div>
            <p className="font-mono text-sm uppercase tracking-wider text-leaf">
              Tuesday, 13:04
            </p>
            <h1 className="mt-4 font-serif text-5xl leading-[1.1] tracking-tight text-ink sm:text-6xl lg:text-7xl">
              I have<br />0 unread.
            </h1>
            <p className="mt-8 max-w-[480px] font-serif text-xl leading-relaxed text-ink-muted sm:text-2xl">
              Eleven things were handled while I was writing. One of them is worth my attention.
            </p>
          </div>

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
        </div>
      </div>
    </section>
  );
}
