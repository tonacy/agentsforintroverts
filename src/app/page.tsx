import { Nav, Footer, Crossing, Ledger, Practice } from "@/components";
import { parseDay } from "@/lib/day";
import dayJson from "@/content/day.json";

// Parsed at build time: a malformed public day fails the export, never the visitor.
const day = parseDay(dayJson);

export default function Home() {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to the main content
      </a>
      <div className="home-chrome">
        <Nav />
      </div>
      <main id="main-content" tabIndex={-1}>
        <Crossing day={day} />
        <Ledger day={day} />
        <Practice />
      </main>
      <Footer />
    </>
  );
}
