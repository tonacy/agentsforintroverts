export function Founder() {
  return (
    <section className="bg-paper-warm px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-4xl">
        <div className="grid gap-12 lg:grid-cols-[1fr_2fr] lg:gap-16">
          <div>
            <div className="flex h-20 w-20 items-center justify-center bg-ink font-display text-3xl font-light text-paper">
              T
            </div>
            <p className="mt-6 font-display text-2xl font-light text-ink">
              Tony Llongueras
            </p>
            <a
              href="mailto:tonacy@gmail.com"
              className="mt-2 inline-flex items-center gap-2 text-ember transition-colors hover:text-ember-glow"
            >
              Want me to set this up for you?
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </a>
          </div>

          <article className="border-l border-rule pl-8 lg:pl-12">
            <h2 className="sr-only">A note from the founder</h2>
            <div className="space-y-6 font-display text-xl font-light leading-relaxed text-ink sm:text-2xl sm:leading-relaxed">
              <p>
                I build and teach agent setups for people who&apos;d rather ship than
                network.
              </p>
              <p className="text-ink-muted">
                Here&apos;s the thing: being introverted doesn&apos;t mean you don&apos;t want
                connections or opportunities. It means the coordination overhead
                drains you faster than it does others.
              </p>
              <p className="text-ink-muted">
                Agents changed that for me. Now I have systems that handle the
                social logistics while I stay in flow. This playbook is what
                I&apos;ve learned building those systems.
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
