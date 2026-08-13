import Image from "next/image";

export function Footer() {
  return (
    <footer className="border-t border-rule bg-paper-warm">
      <div className="mx-auto max-w-[900px] px-6 py-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Image
              src="/mark.png"
              alt=""
              width={40}
              height={40}
              className="w-10 h-10 opacity-70"
            />
            <div>
              <p className="font-display text-lg text-ink">
                Agents for Introverts
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                AI agents for people who build.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 text-sm sm:items-end">
            <a
              href="mailto:tonacy@gmail.com"
              className="text-ink-muted transition-colors hover:text-leaf"
            >
              Contact
            </a>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-rule-light">
          <p className="text-xs text-ink-faint">
            © {new Date().getFullYear()} Tony Llongueras
          </p>
        </div>
      </div>
    </footer>
  );
}
