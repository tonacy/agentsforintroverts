import {
  Nav,
  Hero,
  AgentCards,
  Audience,
  CTABand,
  Footer,
} from "@/components";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <AgentCards />
        <Audience />
        <CTABand />
      </main>
      <Footer />
    </>
  );
}
