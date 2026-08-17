import Image from "next/image";

export function Footer() {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto max-w-[1000px] px-6 py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/mark.png"
              alt=""
              width={24}
              height={24}
              className="w-6 h-6 opacity-60"
            />
            <span className="font-mono text-sm text-ink-muted">
              Agents for Introverts
            </span>
          </div>

          <div className="flex items-center gap-6 font-mono text-sm text-ink-muted">
            <a
              href="mailto:dood@hey.com"
              className="transition-colors hover:text-leaf"
            >
              Contact
            </a>
            <span>© 2026 Tony Llongueras</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
