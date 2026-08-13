import { EmailForm } from "./EmailForm";

export function CTABand() {
  return (
    <section className="border-t border-rule px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-4xl font-light tracking-tight text-ink sm:text-5xl">
          Ready to let agents<br className="hidden sm:block" /> handle the loud work?
        </h2>
        <p className="mt-6 text-lg text-ink-muted">
          Get the free playbook:{" "}
          <span className="text-ink">The Quiet Operator&apos;s Agent Stack</span>
        </p>

        <div className="mt-12">
          <EmailForm variant="cta" />
        </div>

        <p className="mt-8 text-sm text-ink-faint">
          No spam. Just practical agent setups for introverts.
        </p>
      </div>
    </section>
  );
}
