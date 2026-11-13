import type { DebtExtraAmortizationOutput } from "@openmonetis/validators/debts";
import { MoneyValue } from "@/components/money-value";
import { debtExtraModeLabel, debtExtraSourceLabel, formatDebtDate } from "../debts.presentation";

export function DebtExtrasList({ extras }: { extras: DebtExtraAmortizationOutput[] }) {
  if (extras.length === 0) {
    return (
      <p className="py-6 text-center text-muted-foreground text-sm">
        Nenhuma amortização extra neste contrato.
      </p>
    );
  }
  return (
    // Its own scroll, so a contract with dozens of extras never stretches the page: a fixed height
    // on small screens; on large ones it fills the card, which matches the chart card beside it.
    <ul className="grid max-h-96 content-start divide-y divide-border/60 overflow-y-auto overscroll-contain pr-2 lg:absolute lg:inset-0 lg:max-h-none">
      {extras.map((extra) => (
        <li
          className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 py-3"
          key={`${extra.date}-${extra.amount}-${extra.mode}`}
        >
          <span className="w-20 pt-0.5 text-muted-foreground text-xs tabular-nums">
            {formatDebtDate(extra.date)}
          </span>
          <span className="grid min-w-0 gap-0.5">
            <span className="text-sm">{debtExtraModeLabel(extra.mode)}</span>
            <span className="text-muted-foreground text-xs">
              {debtExtraSourceLabel(extra.source)} · <MoneyValue amount={extra.principal} /> no
              principal
            </span>
          </span>
          <MoneyValue amount={extra.amount} className="self-start font-medium text-sm" />
        </li>
      ))}
    </ul>
  );
}
