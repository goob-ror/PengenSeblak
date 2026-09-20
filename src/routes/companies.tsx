import { createFileRoute } from "@tanstack/react-router";
import { CompanyTerminal } from "@/components/terminal/pages";
export const Route = createFileRoute("/companies")({
  head: () => ({
    meta: [
      { title: "Company Terminal — Sectors Terminal" },
      {
        name: "description",
        content:
          "Compare Indonesian listed companies using fundamentals, dominance, and financial safety analysis.",
      },
      { property: "og:title", content: "Company Terminal — Sectors Terminal" },
      {
        property: "og:description",
        content:
          "Compare Indonesian listed companies using fundamentals, dominance, and financial safety analysis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CompanyTerminal,
});
