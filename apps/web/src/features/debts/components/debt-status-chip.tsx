import type { DebtStatementInstallmentStatus } from "@openmonetis/domain/debt-statements";
import { cn } from "@/lib/utils";
import { debtInstallmentStatusLabel } from "../debts.presentation";

const statusClassNames: Record<DebtStatementInstallmentStatus, string> = {
  paid: "bg-success/12 text-success",
  open: "bg-brand/20 text-warning",
  projected: "border border-border text-muted-foreground",
};

/** Situation of an installment as the bank statement records it. */
export function DebtStatusChip({ status }: { status: DebtStatementInstallmentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-5.5 items-center whitespace-nowrap rounded-full px-2 font-medium text-xs",
        statusClassNames[status],
      )}
    >
      {debtInstallmentStatusLabel(status)}
    </span>
  );
}
