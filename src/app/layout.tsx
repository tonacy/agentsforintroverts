import type { Metadata } from "next";
import { Newsreader, IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  style: ["normal", "italic"],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Agents for Introverts — The Quiet Operator's Agent Stack",
  description:
    "How I use AI agents to handle inbox triage, follow-ups, scheduling, group chats, and meetup logistics — so I can show up when it matters. Get the free playbook.",
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
      "How I use five AI agents to stay in flow. Steal the stack.",
    url: "https://agentsforintroverts.com",
    siteName: "Agents for Introverts",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Agents for Introverts",
    description:
      "How I use five AI agents to stay in flow. Steal the stack.",
  },
  metadataBase: new URL("https://agentsforintroverts.com"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${newsreader.variable} ${ibmPlexMono.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
