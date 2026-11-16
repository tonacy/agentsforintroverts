import type { Metadata } from "next";
import { Newsreader, Source_Sans_3, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  style: ["normal", "italic"],
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-detail",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// The agents' voice: ledgers, margin notes, provenance.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Agents for Introverts — Your work, represented.",
    template: "%s | Agents for Introverts",
  },
  description:
    "Writers have agents. Now you do too. Stay at your desk; your agents carry what you make to the few people who’d want it, and nothing leaves without your mark.",
  authors: [{ name: "Tony Llongueras" }],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Agents for Introverts",
    description:
      "Writers have agents. Now you do too: your work, carried to the few who’d want it.",
    url: "/",
    siteName: "Agents for Introverts",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Agents for Introverts",
    description:
      "Writers have agents. Now you do too: your work, carried to the few who’d want it.",
  },
  metadataBase: new URL("https://agentsforintroverts.com"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${newsreader.variable} ${sourceSans.variable} ${inter.variable} ${plexMono.variable}`}>
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
