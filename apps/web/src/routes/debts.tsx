import { createFileRoute } from "@tanstack/react-router";
import { DebtsPage } from "@/features/debts/components/debts-page";

export const Route = createFileRoute("/debts")({
  head: () => ({ meta: [{ title: "Dívidas · OpenMonetis" }] }),
  component: DebtsPage,
});
