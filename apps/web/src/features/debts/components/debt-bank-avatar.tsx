import type { DebtStatementBank } from "@openmonetis/domain/debt-statements";
import { cn } from "@/lib/utils";
import { debtBankInitials, debtBankLabel } from "../debts.presentation";

/** Bank initials; no bank logo is drawn, so no bank branding is reproduced. */
export function DebtBankAvatar({
  bank,
  className,
}: {
  bank: DebtStatementBank;
  className?: string;
}) {
  return (
    <span
      aria-label={debtBankLabel(bank)}
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-xl bg-secondary font-semibold text-foreground text-xs",
        className,
      )}
      role="img"
    >
      {debtBankInitials(bank)}
    </span>
  );
}
