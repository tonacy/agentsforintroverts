export function Footer() {
  return (
    <footer className="border-t border-stone-800/50 bg-stone-950 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div>
            <p className="text-lg font-semibold text-stone-100">
              Agents for Introverts
            </p>
            <p className="mt-1 text-sm text-stone-500">
              AI agents for people who&apos;d rather ship than network.
            </p>
          </div>

          <div className="flex items-center gap-6">
            <a
              href="https://agentsforintroverts.com"
              className="text-sm text-stone-400 transition-colors hover:text-stone-300"
            >
              agentsforintroverts.com
            </a>
            <a
              href="mailto:tonacy@gmail.com"
              className="text-sm text-stone-400 transition-colors hover:text-stone-300"
            >
              Contact
            </a>
          </div>
        </div>

        <div className="mt-8 border-t border-stone-800/50 pt-8 text-center">
          <p className="text-sm text-stone-600">
            © {new Date().getFullYear()} Tony Llongueras. Built with agents, obviously.
          </p>
        </div>
      </div>
    </footer>
  );
}
