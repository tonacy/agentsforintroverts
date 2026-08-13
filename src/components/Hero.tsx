import { EmailForm } from "./EmailForm";

export function Hero() {
  return (
    <section
      id="get-playbook"
      className="relative flex min-h-[90vh] flex-col items-center justify-center px-6 pt-24 pb-16"
    >
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-stone-950 via-stone-950 to-stone-900" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-teal-950/20 via-transparent to-transparent" />

      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-stone-100 sm:text-5xl lg:text-6xl">
          Stay in the cave.
          <br />
          <span className="text-teal-400">Let agents go outside.</span>
        </h1>

        <p className="mt-6 text-lg leading-relaxed text-stone-400 sm:text-xl">
          AI agents that handle the loud work — inbox triage, follow-ups, scheduling,
          group chats, meetup logistics — so you can stay in deep work where you belong.
        </p>

        <div className="mt-10">
          <EmailForm variant="hero" />
        </div>

        <p className="mt-4 text-sm text-stone-500">
          Free playbook: <span className="text-stone-400">The Quiet Operator&apos;s Agent Stack</span> — 5 agents for people who&apos;d rather ship than network.
        </p>
      </div>
    </section>
  );
}
