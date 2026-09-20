import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/terminal/pages";
export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Sectors Terminal" },
      {
        name: "description",
        content:
          "Configure Sectors Terminal workspace, market locale, density, and data disclosures.",
      },
      { property: "og:title", content: "Settings — Sectors Terminal" },
      {
        property: "og:description",
        content:
          "Configure Sectors Terminal workspace, market locale, density, and data disclosures.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});
