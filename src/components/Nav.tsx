import Link from "next/link";
import Image from "next/image";

export function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-rule bg-paper/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[900px] items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-display text-lg tracking-tight text-ink transition-colors hover:text-leaf"
        >
          <Image
            src="/mark.png"
            alt=""
            width={28}
            height={28}
            className="w-7 h-7"
          />
          <span>Agents for Introverts</span>
        </Link>
        <a
          href="#get-playbook"
          className="border border-leaf bg-leaf px-4 py-2 text-sm font-medium text-paper transition-all hover:bg-leaf-light focus:outline-none focus:ring-1 focus:ring-leaf focus:ring-offset-2 focus:ring-offset-paper"
        >
          Get the playbook
        </a>
      </div>
    </nav>
  );
}
