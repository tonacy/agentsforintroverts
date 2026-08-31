import type { MetadataRoute } from "next";

const siteUrl = "https://agentsforintroverts.com";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${siteUrl}/`,
      lastModified: "2026-08-31",
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/manifesto/`,
      lastModified: "2026-08-31",
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/made-with/`,
      lastModified: "2026-08-31",
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
