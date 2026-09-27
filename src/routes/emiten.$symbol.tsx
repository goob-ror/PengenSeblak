import { createFileRoute } from "@tanstack/react-router";
import { EmitenDetail } from "@/components/terminal/EmitenDetail";

export const Route = createFileRoute("/emiten/$symbol")({
  head: () => ({
    meta: [
      { title: "Detail Emiten — Sectors Terminal" },
      {
        name: "description",
        content:
          "Analitik emiten individu: valuasi, Piotroski F-Score, Altman Z-Score, segmen pendapatan, dan free float.",
      },
    ],
  }),
  component: EmitenDetail,
});
