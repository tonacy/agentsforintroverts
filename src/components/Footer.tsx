export function Footer() {
  return (
    <footer className="border-t border-rule bg-linen px-6 py-16">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-display text-xl font-normal text-ink">
              Agents for Introverts
            </p>
            <p className="mt-2 text-ink-muted">
              AI agents for people who&apos;d rather ship than network.
            </p>
          </div>

          <div className="flex flex-col gap-3 text-right sm:items-end">
            <a
              href="https://agentsforintroverts.com"
              className="text-ink-muted transition-colors hover:text-leaf"
            >
              agentsforintroverts.com
            </a>
            <a
              href="mailto:tonacy@gmail.com"
              className="text-ink-muted transition-colors hover:text-leaf"
            >
              Contact
            </a>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-rule">
          <p className="text-sm text-ink-faint">
            © {new Date().getFullYear()} Tony Llongueras. Built with agents, obviously.
          </p>
        </div>
      </div>
    </footer>
  );
}
