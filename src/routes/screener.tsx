import { createFileRoute } from "@tanstack/react-router";
import { DecisionScreener } from "@/components/terminal/pages";
export const Route = createFileRoute("/screener")({
  head: () => ({
    meta: [
      { title: "Decision Screener — Sectors Terminal" },
      {
        name: "description",
        content:
          "Screen Indonesian equities with transparent multi-factor rules and analytical classifications.",
      },
      { property: "og:title", content: "Decision Screener — Sectors Terminal" },
      {
        property: "og:description",
        content:
          "Screen Indonesian equities with transparent multi-factor rules and analytical classifications.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DecisionScreener,
});
