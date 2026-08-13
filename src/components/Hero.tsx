import { EmailForm } from "./EmailForm";

export function Hero() {
  return (
    <section id="get-playbook" className="pt-28 pb-20 sm:pt-36 sm:pb-28">
      <div className="mx-auto max-w-[900px] px-6">
        <div className="max-w-[640px]">
          <h1 className="font-display text-4xl font-light leading-[1.15] tracking-tight text-ink sm:text-5xl lg:text-[56px]">
            Deep work in the sun.
            <br />
            <span className="text-leaf">Agents take the errands.</span>
          </h1>

          <p className="mt-8 max-w-[520px] text-lg leading-relaxed text-ink-muted">
            Your AI social secretary — handling correspondence, calendars, RSVPs,
            and the room — so you can show up when it matters.
          </p>

          <div className="mt-12 max-w-[400px]">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.15em] text-ink-faint">
              Free playbook
            </p>
            <EmailForm />
            <p className="mt-4 text-sm text-ink-faint leading-relaxed">
              The Quiet Operator&apos;s Agent Stack — five agents for people who
              build more than they broadcast.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
