import Link from "next/link";
import Image from "next/image";
import { fieldNotesNavigationHref } from "@/lib/site";

export function Footer() {
  return (
    <footer aria-label="Site footer" className="site-footer">
      <div className="page-width section-stack">
        <div className="site-footer__main">
          <div className="section-stack">
            <Link href="/" className="site-brand"><Image src="/brand/navigational-shelter-mark.png" alt="" width={48} height={48} /><span>Agents for Introverts</span></Link>
            <p className="reading-line">A practice, becoming a product.</p>
          </div>
          <nav aria-label="Site footer navigation" className="site-nav__links">
            <Link href="/manifesto/">Manifesto</Link>
            <Link href="/made-with/">Made with</Link>
            <Link href={fieldNotesNavigationHref}>Field notes</Link>
          </nav>
        </div>
        <div className="home-rule" />
        <p className="label">© 2026 Tony Llongueras</p>
      </div>
    </footer>
  );
}
