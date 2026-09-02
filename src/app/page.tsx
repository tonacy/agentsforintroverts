import { Nav, Hero, ActTwo, ActThree, ActFour, Footer } from "@/components";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        {/* One continuous metaphor, four acts: the torrent arrives, sorts into
            five agents, stops at a line it may not cross, and resolves into a
            quiet Thursday. Each act owns its component and its stylesheet. */}
        <Hero />
        <ActTwo />
        <ActThree />
        <ActFour />
      </main>
      <Footer />
    </>
  );
}
