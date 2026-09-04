import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { oceanAmbient, oceanFragments } from "@/lib/ocean-scene";
import { HeroAnimation } from "./HeroAnimation";
import "./ocean-motion.css";

export function Hero() {
  return (
    <HeroAnimation>
      <section className="landing-hero page-width" aria-labelledby="hero-headline">
        <p className="eyebrow landing-hero__eyebrow">Network fluency / On human terms</p>
        <h1 id="hero-headline" className="landing-hero__headline" tabIndex={-1}>
          Participate in<br />the network.<br />Without living<br />in the feed.
        </h1>
        <p className="landing-hero__intro">
          For people with ideas, projects, and lived experience who want to take part without becoming full-time performers for the feed.
        </p>
        <div className="landing-hero__actions action-row">
          <Link className="action action--primary" href="/manifesto/">Read the manifesto →</Link>
          <a className="action" href="#practice">Explore the practice ↓</a>
        </div>
        <div className="ocean-scene" aria-hidden="true">
          <div className="ocean-scene__canvas">
            <div className="ocean-water" data-motion-node="64:7">
              <Image src="/brand/ocean-ink.png" alt="" width={540} height={360} preload />
            </div>
            {oceanFragments.map((line) => (
              <span key={line.id} className="ocean-fragment" data-motion-node={line.id}
                style={{ left: `${line.x / 540 * 100}%`, top: `${line.y / 468 * 100}%`, width: `${line.width / 540 * 100}%`, height: `${line.height / 468 * 100}%`, fontSize: `calc(var(--ocean-unit) * ${line.fontSize})` } as CSSProperties}>
                {line.text}
              </span>
            ))}
            <div className="ocean-vessel" data-motion-node="42:138">
              <Image src="/brand/ocean-vessel.png" alt="" width={210} height={210} preload />
            </div>
            <p className="ocean-caption" data-motion-node="42:139">A way through.<br />At a human pace.</p>
            {oceanAmbient.map((line) => (
              <span key={line.id} className="ocean-fragment ocean-fragment--ambient" data-motion-node={line.id}
                style={{ left: `${line.x / 540 * 100}%`, top: `${line.y / 468 * 100}%`, width: `${line.width / 540 * 100}%`, height: `${line.height / 468 * 100}%`, fontSize: `calc(var(--ocean-unit) * ${line.fontSize})` } as CSSProperties}>
                {line.text}
              </span>
            ))}
          </div>
        </div>
        <p className="label landing-hero__stage">A public practice, becoming a product.</p>
      </section>
    </HeroAnimation>
  );
}
