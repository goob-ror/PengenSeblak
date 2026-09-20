import { createFileRoute } from "@tanstack/react-router";
import { Watchlist } from "@/components/terminal/pages";
export const Route = createFileRoute("/watchlist")({
  head: () => ({
    meta: [
      { title: "Watchlist — Sectors Terminal" },
      {
        name: "description",
        content:
          "Monitor selected Indonesian companies, derived scores, anomalies, and research notes.",
      },
      { property: "og:title", content: "Watchlist — Sectors Terminal" },
      {
        property: "og:description",
        content:
          "Monitor selected Indonesian companies, derived scores, anomalies, and research notes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Watchlist,
});
