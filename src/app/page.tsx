import {
  Nav,
  Hero,
  AgentCards,
  Proof,
  Audience,
  Founder,
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
        <Proof />
        <Audience />
        <Founder />
        <CTABand />
      </main>
      <Footer />
    </>
  );
}
