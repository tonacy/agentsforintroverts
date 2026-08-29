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
  title: {
    default: "Agents for Introverts — Network fluency on human terms",
    template: "%s | Agents for Introverts",
  },
  description:
    "Agents that turn network-scale discourse into grounded context, common ground, and a few human conversations worth your time.",
  authors: [{ name: "Tony Llongueras" }],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Agents for Introverts",
    description:
      "The world comes in. Your lived experience goes out. The human stays in focus.",
    url: "/",
    siteName: "Agents for Introverts",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Agents for Introverts",
    description:
      "The world comes in. Your lived experience goes out. The human stays in focus.",
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
