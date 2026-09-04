import { Nav, Hero, Footer } from "@/components";
import { HomeSections } from "@/components/HomeSections";

export default function Home() {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to the main content
      </a>
      <Nav />
      <main id="main-content" tabIndex={-1}>
        <Hero />
        <HomeSections />
      </main>
      <Footer />
    </>
  );
}
