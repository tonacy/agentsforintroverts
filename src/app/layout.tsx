import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Agents for Introverts — Let AI handle the loud work",
  description:
    "AI agents that handle inbox triage, follow-ups, scheduling, group chats, and meetup logistics — so introverts can stay in deep work where they belong.",
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
      "Stay in the cave. Let agents go outside. AI agents for people who'd rather ship than network.",
    url: "https://agentsforintroverts.com",
    siteName: "Agents for Introverts",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Agents for Introverts",
    description:
      "Stay in the cave. Let agents go outside. AI agents for people who'd rather ship than network.",
  },
  metadataBase: new URL("https://agentsforintroverts.com"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} scroll-smooth`}>
      <body className="min-h-screen bg-stone-950 font-sans text-stone-100 antialiased">
        {children}
      </body>
    </html>
  );
}
