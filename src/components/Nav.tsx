import Link from "next/link";

export function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-stone-800/50 bg-stone-950/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-stone-100"
        >
          Agents for Introverts
        </Link>
        <a
          href="#get-playbook"
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 active:scale-[0.98]"
        >
          Get the playbook
        </a>
      </div>
    </nav>
  );
}
