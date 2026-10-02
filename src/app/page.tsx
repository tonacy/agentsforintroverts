import { Nav, Footer, Crossing, PieceReveal, DeskShowcase, Story, Practice } from "@/components";

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
        <Crossing />
        <PieceReveal />
        <DeskShowcase />
        <Story />
        <Practice />
      </main>
      <Footer />
    </>
  );
}
