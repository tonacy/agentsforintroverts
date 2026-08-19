import Link from "next/link";
import Image from "next/image";

type NavProps = {
  current?: "manifesto";
};

export function Nav({ current }: NavProps) {
  return (
    <nav aria-label="Primary" className="border-b border-rule bg-paper">
      <div className="mx-auto flex max-w-[1000px] items-center justify-between gap-5 px-4 py-1.5 sm:px-6">
        <Link
          href="/"
          className="nav-link flex min-h-11 min-w-0 items-center gap-2 font-mono text-sm tracking-tight text-ink"
        >
          <Image
            src="/mark.png"
            alt=""
            width={24}
            height={24}
            className="w-6 h-6"
          />
          <span className="truncate">Agents for Introverts</span>
        </Link>
        <div className="flex shrink-0 items-center gap-4 sm:gap-6">
          <Link
            href="/manifesto/"
            aria-current={current === "manifesto" ? "page" : undefined}
            className={`nav-link inline-flex min-h-11 items-center border-b font-mono text-xs text-ink sm:text-sm ${
              current === "manifesto"
                ? "border-ink"
                : "border-transparent"
            }`}
          >
            Manifesto
          </Link>
          <Link
            href="/#playbook"
            className="nav-link nav-link--playbook hidden min-h-11 items-center border-b border-ink font-mono text-xs text-ink min-[480px]:inline-flex sm:text-sm"
          >
            Playbook
          </Link>
        </div>
      </div>
    </nav>
  );
}
