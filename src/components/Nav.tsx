import Link from "next/link";
import Image from "next/image";

export function Nav() {
  return (
    <nav className="border-b border-rule bg-paper">
      <div className="mx-auto flex max-w-[1000px] items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="nav-link flex items-center gap-2 font-mono text-sm tracking-tight text-ink"
        >
          <Image
            src="/mark.png"
            alt=""
            width={24}
            height={24}
            className="w-6 h-6"
          />
          <span>Agents for Introverts</span>
        </Link>
        <a
          href="#playbook"
          className="nav-link nav-link--playbook border-b border-ink pb-0.5 font-mono text-sm text-ink"
        >
          Playbook
        </a>
      </div>
    </nav>
  );
}
