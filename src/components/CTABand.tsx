import { EmailForm } from "./EmailForm";

export function CTABand() {
  return (
    <section className="border-t border-rule">
      <div className="mx-auto max-w-[900px] px-6 py-20 sm:py-24">
        <div className="max-w-[520px]">
          <h2 className="font-display text-2xl font-light tracking-tight text-ink sm:text-3xl">
            Ready to let agents handle
            <br className="hidden sm:block" /> the coordination?
          </h2>
          <p className="mt-4 text-ink-muted">
            Get the free playbook:{" "}
            <span className="text-leaf">
              The Quiet Operator&apos;s Agent Stack
            </span>
          </p>

          <div className="mt-8 max-w-[400px]">
            <EmailForm />
          </div>

          <p className="mt-6 text-sm text-ink-faint">
            No spam. Just practical agent setups for people who build.
          </p>
        </div>
      </div>
    </section>
  );
}
