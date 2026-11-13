import type { DebtScheduleRowOutput } from "@openmonetis/validators/debts";
import { Fragment } from "react";
import { MoneyValue } from "@/components/money-value";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { debtChargeLabel, formatDebtDate, sumDebtCharges } from "../debts.presentation";
import { DebtStatusChip } from "./debt-status-chip";

/**
 * Installments as the bank lists them. `todayAfter` is the number of the last installment already
 * due: a "Hoje" divider is drawn right after it and the next row is highlighted.
 */
export function DebtScheduleTable({
  rows,
  todayAfter,
}: {
  rows: DebtScheduleRowOutput[];
  todayAfter: number;
}) {
  const showDividerBeforeFirst = rows[0] !== undefined && rows[0].number === todayAfter + 1;
  return (
    <Table className="tabular-nums">
      <TableHeader className="sticky top-0 z-10 bg-card">
        <TableRow>
          <TableHead>Nº</TableHead>
          <TableHead>Vencimento</TableHead>
          <TableHead>Situação</TableHead>
          <TableHead className="text-right">Amortização</TableHead>
          <TableHead className="text-right">Juros</TableHead>
          <TableHead className="text-right">Encargos</TableHead>
          <TableHead className="text-right">Parcela</TableHead>
          <TableHead className="text-right">Saldo após</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {showDividerBeforeFirst ? <TodayDivider /> : null}
        {rows.map((row) => (
          <Fragment key={row.number}>
            <TableRow className={cn(row.number === todayAfter + 1 && "bg-accent")}>
              <TableCell>{row.number}</TableCell>
              <TableCell>{formatDebtDate(row.dueDate)}</TableCell>
              <TableCell>
                <DebtStatusChip status={row.status} />
              </TableCell>
              <TableCell className="text-right">
                <MoneyValue amount={row.amortization} />
              </TableCell>
              <TableCell className="text-right">
                <MoneyValue amount={row.interest} />
              </TableCell>
              <TableCell
                className="text-right"
                title={row.charges
                  .map(
                    (charge) =>
                      `${debtChargeLabel(charge.code)}: ${charge.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
                  )
                  .join(" · ")}
              >
                <MoneyValue amount={sumDebtCharges(row)} />
              </TableCell>
              <TableCell className="text-right">
                <MoneyValue amount={row.installment} className="font-medium" />
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                <MoneyValue amount={row.balanceAfter} />
              </TableCell>
            </TableRow>
            {row.number === todayAfter && row !== rows.at(-1) ? <TodayDivider /> : null}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}

function TodayDivider() {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell className="py-1.5" colSpan={8}>
        <span className="flex items-center gap-2 font-semibold text-brand-strong text-xs after:flex-1 after:border-brand after:border-t-[1.5px] after:border-dashed after:content-['']">
          Hoje
        </span>
      </TableCell>
    </TableRow>
  );
}
