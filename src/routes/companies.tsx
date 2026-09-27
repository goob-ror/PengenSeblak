import { createFileRoute } from "@tanstack/react-router";
import { CompanyTerminal } from "@/components/terminal/pages";

export interface CompaniesSearch {
  symbol?: string | undefined;
}

export const Route = createFileRoute("/companies")({
  validateSearch: (search: Record<string, unknown>): CompaniesSearch => ({
    symbol: typeof search["symbol"] === "string" ? search["symbol"].toUpperCase() : undefined,
  }),
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
