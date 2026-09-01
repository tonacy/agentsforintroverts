import type { Metadata } from "next";
import { Newsreader, IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";
import { authorName, siteName, siteUrl } from "./site";

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
  authors: [{ name: authorName }],
  creator: authorName,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: siteName,
    description:
      "How I use five AI agents to stay in flow. Steal the stack.",
    url: siteUrl,
    siteName,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description:
      "How I use five AI agents to stay in flow. Steal the stack.",
  },
  metadataBase: new URL(siteUrl),
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      "@id": `${siteUrl}/#person`,
      name: authorName,
      url: siteUrl,
      description:
        "Builds and runs a small stack of AI agents for inbox triage, follow-ups, scheduling, group chats, and meetup logistics.",
      knowsAbout: [
        "AI agents",
        "workflow automation",
        "personal knowledge work",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: siteName,
      description:
        "How I use five AI agents to handle inbox triage, follow-ups, scheduling, group chats, and meetup logistics — so I can show up when it matters.",
      inLanguage: "en-US",
      author: { "@id": `${siteUrl}/#person` },
      publisher: { "@id": `${siteUrl}/#person` },
    },
  ],
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </body>
    </html>
  );
}
