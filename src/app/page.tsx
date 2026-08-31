import { Nav, Hero, Footer } from "@/components";

export default function Home() {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to the main content
      </a>
      <Nav />
      <main id="main-content" tabIndex={-1}>
        <Hero />
      </main>
      <Footer />
    </>
  );
}
