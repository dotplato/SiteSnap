import type { Metadata } from "next";

export const siteMetadata: Metadata = {
  title: "SiteSnap - just spit it out!",
  description: "Crawl websites, capture full-page screenshots, and export as ZIP.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
};
