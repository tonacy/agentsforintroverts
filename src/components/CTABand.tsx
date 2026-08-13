import { EmailForm } from "./EmailForm";

export function CTABand() {
  return (
    <section className="relative bg-navy-deep px-6 py-24 sm:py-32 overflow-hidden">
      {/* Subtle texture */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220%200%20200%20200%22%20xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter%20id=%22n%22%3E%3CfeTurbulence%20type=%22fractalNoise%22%20baseFrequency=%220.8%22%20numOctaves=%223%22%20stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect%20width=%22100%25%22%20height=%22100%25%22%20filter=%22url(%23n)%22/%3E%3C/svg%3E')]" />
      </div>

      <div className="relative mx-auto max-w-2xl text-center">
        <h2 className="font-display text-4xl font-light tracking-tight text-paper sm:text-5xl">
          Ready to let agents<br className="hidden sm:block" /> handle the loud work?
        </h2>
        <p className="mt-6 text-lg text-paper/70">
          Get the free playbook:{" "}
          <span className="text-camel">The Quiet Operator&apos;s Agent Stack</span>
        </p>

        <div className="mt-12">
          <EmailForm variant="cta" />
        </div>

        <p className="mt-8 text-sm text-paper/50">
          No spam. Just practical agent setups for introverts.
        </p>
      </div>
    </section>
  );
}
