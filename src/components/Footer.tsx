import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-rule bg-paper">
      <div className="mx-auto max-w-[1000px] px-6 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <p className="font-serif italic text-ink-muted text-sm">
            A practice, becoming a product.
          </p>
          <nav
            aria-label="Footer"
            className="flex flex-wrap items-center gap-x-5 gap-y-1 sm:ml-auto"
          >
            <Link
              href="/"
              className="nav-link inline-flex min-h-11 items-center font-mono text-xs text-ink-muted"
            >
              Home
            </Link>
            <Link
              href="/manifesto/"
              className="nav-link inline-flex min-h-11 items-center font-mono text-xs text-ink-muted"
            >
              Manifesto
            </Link>
            <Link
              href="/made-with/"
              className="nav-link inline-flex min-h-11 items-center font-mono text-xs text-ink-muted"
            >
              Made with
            </Link>
            <Link
              href="/#field-notes"
              className="nav-link inline-flex min-h-11 items-center font-mono text-xs text-ink-muted"
            >
              Field Notes
            </Link>
          </nav>
          <p className="font-mono text-xs text-ink-faint">
            © 2026 Tony Llongueras
          </p>
        </div>
      </div>
    </footer>
  );
}
