import { createFileRoute } from "@tanstack/react-router";
import { NewsIntelligence } from "@/components/terminal/pages";
export const Route = createFileRoute("/news")({
  head: () => ({
    meta: [
      { title: "News Intelligence — Sectors Terminal" },
      {
        name: "description",
        content:
          "Analyze Indonesian market news by sentiment, catalyst, impact, company, and sector.",
      },
      { property: "og:title", content: "News Intelligence — Sectors Terminal" },
      {
        property: "og:description",
        content:
          "Analyze Indonesian market news by sentiment, catalyst, impact, company, and sector.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NewsIntelligence,
});
