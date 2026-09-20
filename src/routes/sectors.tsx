import { createFileRoute } from "@tanstack/react-router";
import { SectorIntelligence } from "@/components/terminal/pages";
export const Route = createFileRoute("/sectors")({
  head: () => ({
    meta: [
      { title: "Sector Intelligence — Sectors Terminal" },
      {
        name: "description",
        content:
          "Research Indonesian sectors with health scores, fundamentals, peer universes, and divergences.",
      },
      { property: "og:title", content: "Sector Intelligence — Sectors Terminal" },
      {
        property: "og:description",
        content:
          "Research Indonesian sectors with health scores, fundamentals, peer universes, and divergences.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SectorIntelligence,
});
