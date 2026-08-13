import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Agents for Introverts — Deep work in the sun",
  description:
    "AI agents that handle inbox triage, follow-ups, scheduling, group chats, and meetup logistics — so introverts can protect their focus and still show up for people who matter.",
  keywords: [
    "AI agents",
    "automation",
    "introverts",
    "productivity",
    "email automation",
    "scheduling",
    "deep work",
  ],
  authors: [{ name: "Tony Llongueras" }],
  openGraph: {
    title: "Agents for Introverts",
    description:
      "Deep work in the sun. Agents take the errands. AI agents for people who'd rather ship than network.",
    url: "https://agentsforintroverts.com",
    siteName: "Agents for Introverts",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Agents for Introverts",
    description:
      "Deep work in the sun. Agents take the errands. AI agents for people who'd rather ship than network.",
  },
  metadataBase: new URL("https://agentsforintroverts.com"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${sourceSans.variable} scroll-smooth`}>
      <body className="min-h-screen bg-paper font-body text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
