import { createFileRoute } from "@tanstack/react-router";
import { MarketOverview } from "@/components/terminal/pages";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IndoMarket Terminal — Sectors Terminal" },
      {
        name: "description",
        content:
          "Live Indonesian market breadth, sector health, anomalies, and derived intelligence.",
      },
      { property: "og:title", content: "IndoMarket Terminal — Sectors Terminal" },
      {
        property: "og:description",
        content:
          "Live Indonesian market breadth, sector health, anomalies, and derived intelligence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MarketOverview,
});
