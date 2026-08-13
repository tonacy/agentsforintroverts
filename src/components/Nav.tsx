import Link from "next/link";

export function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-rule bg-paper/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="font-display text-lg font-normal tracking-tight text-ink"
        >
          Agents for Introverts
        </Link>
        <a
          href="#get-playbook"
          className="bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-ink-muted focus:outline-none focus:ring-2 focus:ring-ember focus:ring-offset-2 focus:ring-offset-paper active:scale-[0.98]"
        >
          Get the playbook
        </a>
      </div>
    </nav>
  );
}
