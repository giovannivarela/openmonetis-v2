import type { DebtOutput } from "@openmonetis/validators/debts";
import { Link } from "@tanstack/react-router";
import { MoneyValue } from "@/components/money-value";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  formatDebtAnnualRate,
  formatDebtDate,
  formatDebtMonth,
  formatDebtShare,
  getDebtAmortizedShare,
} from "../debts.presentation";
import { DebtBankAvatar } from "./debt-bank-avatar";

export function DebtCard({ debt }: { debt: DebtOutput }) {
  const share = getDebtAmortizedShare({
    principal: debt.terms.principal,
    currentBalance: debt.summary.currentBalance,
  });

  return (
    <Card className="relative gap-4 px-5 py-5 transition-shadow focus-within:ring-3 focus-within:ring-ring/50 hover:shadow-md">
      <div className="flex min-w-0 items-center gap-3">
        <DebtBankAvatar bank={debt.bank} />
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-base">
            <Link
              className="outline-none after:absolute after:inset-0 after:content-['']"
              params={{ debtId: debt.id }}
              to="/debts/$debtId"
            >
              {debt.name}
            </Link>
          </h2>
          <p className="truncate text-muted-foreground text-xs">
            SAC · {formatDebtAnnualRate(debt.terms.annualEffectiveRate)} · extrato de{" "}
            {formatDebtDate(debt.statementIssuedOn)}
          </p>
        </div>
      </div>
      <div>
        <p className="text-muted-foreground text-xs">Saldo devedor</p>
        <MoneyValue amount={debt.summary.currentBalance} className="font-medium text-xl" />
      </div>
      <div className="grid gap-1.5">
        <Progress
          aria-label={`${formatDebtShare(share)} do valor financiado já quitado`}
          indicatorClassName="bg-info"
          value={share * 100}
        />
        <p className="text-muted-foreground text-xs">
          {formatDebtShare(share)} do valor financiado já quitado
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground text-xs">Próxima parcela</dt>
          {debt.nextInstallment ? (
            <dd className="grid">
              <MoneyValue amount={debt.nextInstallment.amount} className="font-medium" />
              <span className="text-muted-foreground text-xs">
                {formatDebtDate(debt.nextInstallment.dueDate)}
              </span>
            </dd>
          ) : (
            <dd className="font-medium">Quitada</dd>
          )}
        </div>
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground text-xs">Termina em</dt>
          <dd className="grid justify-items-start gap-1">
            <span className="font-medium">{formatDebtMonth(debt.summary.lastDueDate)}</span>
            {debt.summary.monthsCut > 0 ? (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                {debt.summary.monthsCut} meses a menos
              </span>
            ) : null}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
