import Image from "next/image";
import { EmailForm } from "./EmailForm";

export function Hero() {
  return (
    <section
      id="get-playbook"
      className="relative min-h-screen overflow-hidden bg-gradient-to-b from-paper-lamp via-paper to-paper-warm"
    >
      {/* Lamp glow effect */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-20 left-[15%] w-[300px] h-[400px] bg-brass/[0.03] rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 pt-32 pb-16 sm:pt-40 lg:pt-32">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-8 lg:items-start">
          {/* Left: Text content - "in the room" */}
          <div className="relative z-10 lg:pt-12">
            <h1 className="font-display text-5xl font-light leading-[1.05] tracking-tight text-ink sm:text-6xl lg:text-7xl">
              Stay in
              <br />
              the cave.
              <br />
              <span className="text-navy">Let agents</span>
              <br />
              <span className="italic text-rust">go outside.</span>
            </h1>

            <p className="mt-10 max-w-md text-lg leading-relaxed text-ink-muted sm:text-xl sm:leading-relaxed">
              AI agents that handle the loud work — inbox triage, follow-ups,
              scheduling, group chats — so you can stay in deep work where you
              belong.
            </p>

            <div className="mt-12 max-w-sm">
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-camel-muted">
                Free playbook
              </p>
              <EmailForm variant="hero" />
              <p className="mt-4 text-sm text-ink-faint leading-relaxed">
                The Quiet Operator&apos;s Agent Stack — five agents for people
                who&apos;d rather ship than network.
              </p>
            </div>
          </div>

          {/* Right: The window to outside */}
          <div className="relative lg:-mr-8 xl:-mr-16">
            {/* Window frame */}
            <div className="relative">
              {/* Subtle shadow around frame */}
              <div className="absolute -inset-4 bg-gradient-to-br from-ink/[0.02] via-transparent to-ink/[0.04] rounded-sm blur-sm" />
              
              {/* The illustration as a window */}
              <div className="relative overflow-hidden rounded-sm shadow-[0_4px_60px_-12px_rgba(0,0,0,0.15)]">
                <Image
                  src="/hero-cozy-agents.png"
                  alt="View from a cozy interior: through rain-streaked window, blocky agent figures on the street hail cabs, share umbrellas, and carry packages while you stay warm inside"
                  width={1200}
                  height={675}
                  className="w-full h-auto"
                  priority
                />
                {/* Subtle vignette to blend edges */}
                <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_80px_rgba(250,247,242,0.3)]" />
              </div>

              {/* Decorative elements suggesting the room */}
              <div className="hidden lg:block absolute -bottom-6 -left-8 w-24 h-24">
                <div className="w-full h-full bg-gradient-to-t from-paper-warm via-paper to-transparent" />
              </div>
            </div>

            {/* Caption */}
            <p className="mt-6 text-center text-sm italic text-ink-faint font-display">
              They go out so you don&apos;t have to.
            </p>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-camel-muted">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="animate-[bounce_2.5s_ease-in-out_infinite] motion-reduce:animate-none"
        >
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      </div>
    </section>
  );
}
