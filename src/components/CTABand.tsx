import { EmailForm } from "./EmailForm";

export function CTABand() {
  return (
    <section className="bg-gradient-to-b from-stone-900 to-stone-950 px-6 py-24">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-stone-100 sm:text-4xl">
          Ready to let agents handle the loud work?
        </h2>
        <p className="mt-4 text-lg text-stone-400">
          Get the free playbook: <span className="text-stone-300">The Quiet Operator&apos;s Agent Stack</span>
        </p>

        <div className="mt-10">
          <EmailForm variant="cta" />
        </div>

        <p className="mt-8 text-sm text-stone-500">
          No spam. Just practical agent setups for introverts.
        </p>
      </div>
    </section>
  );
}
