export function Founder() {
  return (
    <section className="section-interior relative px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-4xl relative z-10">
        <div className="grid gap-12 lg:grid-cols-[1fr_2fr] lg:gap-16">
          {/* Avatar and name */}
          <div>
            <div className="flex h-20 w-20 items-center justify-center bg-leaf font-display text-3xl font-light text-paper rounded-sm">
              T
            </div>
            <p className="mt-6 font-display text-2xl font-light text-ink">
              Tony Llongueras
            </p>
            <a
              href="mailto:tonacy@gmail.com"
              className="mt-3 inline-flex items-center gap-2 text-terracotta transition-colors hover:text-terracotta-deep text-sm"
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
                  strokeWidth={1.5}
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </a>
          </div>

          {/* Quote/story */}
          <article className="border-l-2 border-terracotta-soft pl-8 lg:pl-12">
            <h2 className="sr-only">A note from the founder</h2>
            <div className="space-y-6 font-display text-xl font-light leading-relaxed text-ink sm:text-2xl sm:leading-relaxed">
              <p>
                I build agent setups for people who&apos;d rather ship than network.
              </p>
              <p className="text-ink-muted">
                Being introverted doesn&apos;t mean you don&apos;t want connections. 
                It means the coordination overhead drains you faster than it does others.
              </p>
              <p className="text-ink-muted">
                Agents changed that for me. Now I have systems that handle the 
                social logistics while I protect my focus — and actually show up 
                for the people and events that matter. This playbook is what 
                I&apos;ve learned building those systems.
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
