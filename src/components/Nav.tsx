import Link from "next/link";
import Image from "next/image";
import { fieldNotesNavigationHref } from "@/lib/site";

type NavProps = { current?: "manifesto" | "made-with" };

export function Nav({ current }: NavProps) {
  return (
    <nav aria-label="Primary" className="site-nav page-width">
      <Link href="/" className="site-brand">
        <Image src="/brand/navigational-shelter-mark.png" alt="" width={48} height={48} />
        <span>Agents for Introverts</span>
      </Link>
      <div className="site-nav__links">
        <Link href="/manifesto/" aria-current={current === "manifesto" ? "page" : undefined}>Manifesto</Link>
        <Link href="/made-with/" aria-current={current === "made-with" ? "page" : undefined}>Made with</Link>
        <Link href={fieldNotesNavigationHref}>Field notes</Link>
      </div>
    </nav>
  );
}
