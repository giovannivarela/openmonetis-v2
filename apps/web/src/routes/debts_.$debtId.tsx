import { createFileRoute } from "@tanstack/react-router";
import { DebtDetailPage } from "@/features/debts/components/debt-detail-page";

export const Route = createFileRoute("/debts_/$debtId")({
  head: () => ({ meta: [{ title: "Dívida · OpenMonetis" }] }),
  component: DebtRoute,
});

function DebtRoute() {
  const { debtId } = Route.useParams();
  return <DebtDetailPage debtId={debtId} key={debtId} />;
}
