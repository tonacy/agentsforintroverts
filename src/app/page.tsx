import {
  Nav,
  Hero,
  HandledList,
  Footer,
} from "@/components";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <HandledList />
      </main>
      <Footer />
    </>
  );
}
