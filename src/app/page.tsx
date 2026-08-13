import {
  Nav,
  Hero,
  HandledList,
  TheFive,
  Audience,
  Footer,
} from "@/components";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <HandledList />
        <TheFive />
        <Audience />
      </main>
      <Footer />
    </>
  );
}
