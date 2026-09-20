import { createFileRoute } from "@tanstack/react-router";
import { Methodology } from "@/components/terminal/pages";
export const Route = createFileRoute("/methodology")({
  head: () => ({
    meta: [
      { title: "Methodology — Sectors Terminal" },
      {
        name: "description",
        content:
          "Understand the indicators, weights, normalization, and interpretation behind every custom score.",
      },
      { property: "og:title", content: "Methodology — Sectors Terminal" },
      {
        property: "og:description",
        content:
          "Understand the indicators, weights, normalization, and interpretation behind every custom score.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Methodology,
});
