import { EmailForm } from "./EmailForm";

export function Hero() {
  return (
    <section
      id="get-playbook"
      className="relative min-h-[90vh] flex flex-col justify-center px-6 pt-32 pb-24 sm:pt-40 sm:pb-32"
    >
      <div className="mx-auto w-full max-w-4xl">
        <h1 className="font-display text-5xl font-light leading-[1.1] tracking-tight text-ink sm:text-7xl lg:text-8xl">
          Stay in the cave.
          <br />
          <span className="italic text-ember">Let agents go outside.</span>
        </h1>

        <p className="mt-10 max-w-xl text-xl leading-relaxed text-ink-muted sm:text-2xl sm:leading-relaxed">
          AI agents that handle the loud work — inbox triage, follow-ups,
          scheduling, group chats, meetup logistics — so you can stay in deep
          work where you belong.
        </p>

        <div className="mt-16 max-w-md">
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-ink-faint">
            Free playbook
          </p>
          <EmailForm variant="hero" />
          <p className="mt-4 text-base text-ink-faint">
            The Quiet Operator&apos;s Agent Stack — five agents for people who&apos;d
            rather ship than network.
          </p>
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-ink-faint">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="animate-[bounce_2s_ease-in-out_infinite] motion-reduce:animate-none"
        >
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      </div>
    </section>
  );
}
