export function Founder() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-stone-800/50 bg-stone-900/30 p-8 sm:p-12">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-600 to-teal-800 text-2xl font-bold text-white">
              T
            </div>
            <div>
              <h2 className="text-2xl font-bold text-stone-100">
                A note from Tony
              </h2>
              <div className="mt-4 space-y-4 text-stone-400 leading-relaxed">
                <p>
                  I&apos;m Tony Llongueras. I build and teach agent setups for people
                  who&apos;d rather ship than network.
                </p>
                <p>
                  Here&apos;s the thing: being introverted doesn&apos;t mean you don&apos;t want
                  connections or opportunities. It means the coordination
                  overhead drains you faster than it does others.
                </p>
                <p>
                  Agents changed that for me. Now I have systems that handle the
                  social logistics while I stay in flow. This playbook is what
                  I&apos;ve learned building those systems.
                </p>
              </div>
              <a
                href="mailto:tonacy@gmail.com"
                className="mt-6 inline-flex items-center gap-2 text-teal-400 transition-colors hover:text-teal-300"
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
          </div>
        </div>
      </div>
    </section>
  );
}
