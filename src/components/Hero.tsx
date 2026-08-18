import { EmailForm } from "./EmailForm";

const torrentPhrases = [
  "reply", "intro", "ask", "mention", "thread", "invite"
];

function TorrentColumn({ side }: { side: "left" | "right" }) {
  const label = side === "left" ? "lived experience" : "the world";
  const alignment = side === "left" ? "text-right" : "text-left";
  
  const lines: string[] = [];
  for (let i = 0; i < 60; i++) {
    const phrase = torrentPhrases[i % torrentPhrases.length];
    lines.push(`example ${phrase}`);
  }

  return (
    <div className={`torrent-column torrent-${side} font-mono text-[10px] leading-[1.6] text-torrent ${alignment} select-none`}>
      <div className="torrent-label font-mono text-[9px] uppercase tracking-wider text-torrent-label mb-3">
        {label}
      </div>
      <div className="torrent-lines" aria-hidden="true">
        {lines.map((line, i) => (
          <div key={i} className="whitespace-nowrap">
            <span className="text-torrent-dim">example</span>{" "}
            <span className="text-torrent">{line.replace("example ", "")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative min-h-[calc(100vh-60px)] overflow-hidden">
      <div className="tempo-grid">
        {/* Left torrent margin */}
        <TorrentColumn side="left" />

        {/* Center content - the still sun */}
        <div className="center-content relative flex flex-col justify-between py-8 px-6 sm:py-12 sm:px-10 lg:py-16 lg:px-16">
          {/* Sun wash background */}
          <div 
            className="sun-wash absolute inset-0 pointer-events-none"
            aria-hidden="true"
          />

          {/* Main content */}
          <div className="relative z-10 flex-1 flex flex-col">
            {/* Headline */}
            <div className="max-w-[600px] mx-auto text-center flex-1 flex flex-col justify-center">
              <h1 className="font-serif text-4xl sm:text-5xl lg:text-[56px] leading-[1.15] tracking-tight text-ink italic">
                Out there the feeds never stop.<br />
                In here I get a slow one.
              </h1>
              
              <p className="mt-6 sm:mt-8 font-serif text-lg sm:text-xl text-ink-muted leading-relaxed max-w-[480px] mx-auto">
                Lived experience goes out. The world comes in. Agents translate both. This is the pace.
              </p>

              {/* Arrived line */}
              <div className="mt-10 sm:mt-14">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-arrived-label">
                  Arrived
                </p>
                <p className="mt-2 font-serif text-xl sm:text-2xl text-ink">
                  Thursday morning is still yours.
                </p>
              </div>
            </div>

            {/* Agents translate row */}
            <div className="mt-12 sm:mt-16 text-center">
              <p className="font-mono text-xs text-ink-faint tracking-wide">
                agents translate
              </p>
              <div className="mt-4 flex flex-wrap justify-center items-baseline gap-x-3 gap-y-2">
                <span className="font-serif text-ink">Calendar</span>
                <span className="font-serif italic text-ink-muted">access to my time</span>
              </div>
              <div className="mt-3 flex flex-wrap justify-center items-baseline gap-x-2 gap-y-1 text-sm">
                <span className="font-serif text-ink">X</span>
                <span className="font-serif italic text-ink-muted">observation</span>
                <span className="text-ink-faint mx-1">·</span>
                <span className="font-serif text-ink">LinkedIn</span>
                <span className="font-serif italic text-ink-muted">work story</span>
                <span className="text-ink-faint mx-1">·</span>
                <span className="font-serif text-ink">Email</span>
                <span className="font-serif italic text-ink-muted">relationship</span>
                <span className="text-ink-faint mx-1">·</span>
                <span className="font-serif text-ink">Newsletter</span>
              </div>
              <p className="font-serif italic text-ink-muted text-sm mt-1">durable thinking</p>
            </div>

            {/* Playbook capture */}
            <div id="playbook" className="mt-10 sm:mt-14 max-w-[400px] mx-auto w-full">
              <EmailForm />
              <p className="mt-3 text-center font-mono text-xs text-ink-faint">
                Free — The Quiet Operator&apos;s Agent Stack. Five setups, no spam.
              </p>
            </div>
          </div>
        </div>

        {/* Right torrent margin */}
        <TorrentColumn side="right" />
      </div>
    </section>
  );
}
