import {
  type DebtExpensePaymentMethod,
  debtExpensePaymentMethods,
} from "@openmonetis/domain/debt-expenses";
import type {
  DebtExtraAmortizationSource,
  DebtStatementBank,
  DebtStatementInstallmentStatus,
} from "@openmonetis/domain/debt-statements";
import type { DebtExtraAmortizationMode } from "@openmonetis/domain/debts";
import { dateOnlyToSafeInstant, formatDateInBrazil } from "@openmonetis/shared/date-time";
import type { DebtScheduleRowOutput } from "@openmonetis/validators/debts";
import { maxProjectedMonthlyCorrectionRate } from "@openmonetis/validators/debts";
import { formatPeriod } from "../../lib/period-presentation";

/** One point of the balance chart: the contract, then the balance after each installment. */
export type DebtBalancePoint = {
  date: string;
  /** Installment number; `null` for the contract point. */
  number: number | null;
  balance: number;
  /** Total of the installment; `null` for the contract point. */
  installment: number | null;
  /** Principal of the extras carried by the installment. */
  extraPrincipal: number;
  /** Balance up to today, `null` afterwards. */
  recorded: number | null;
  /** Balance from today on, `null` before; the last due point belongs to both lines. */
  projected: number | null;
  /** Balance on installments that carry an extra amortization, for the markers. */
  extra: number | null;
};

/**
 * Points for the balance chart. The installments already due (`paidInstallments`, the same split as
 * the API summary) draw the solid line; the rest draws the projection, starting where it ends.
 */
export function buildDebtBalanceSeries(
  terms: { principal: number; contractDate: string },
  schedule: DebtScheduleRowOutput[],
  paidInstallments: number,
): DebtBalancePoint[] {
  const points = [
    {
      date: terms.contractDate,
      number: null,
      balance: terms.principal,
      installment: null,
      extraPrincipal: 0,
    },
    ...schedule.map((row) => ({
      date: row.dueDate,
      number: row.number,
      balance: row.balanceAfter,
      installment: row.installment,
      extraPrincipal: row.extraPrincipal,
    })),
  ];
  return points.map((point, index) => ({
    date: point.date,
    number: point.number,
    balance: point.balance,
    installment: point.installment,
    extraPrincipal: point.extraPrincipal,
    recorded: index <= paidInstallments ? point.balance : null,
    projected: index >= paidInstallments ? point.balance : null,
    extra: point.extraPrincipal > 0 ? point.balance : null,
  }));
}

/** Axis ticks: the January points after the start, one every `everyYears` years. */
export function debtBalanceYearTicks(series: DebtBalancePoint[], everyYears: number) {
  const januaries = series.slice(1).filter((point) => point.date.slice(5, 7) === "01");
  const firstYear = Number(januaries[0]?.date.slice(0, 4));
  return januaries
    .filter((point) => (Number(point.date.slice(0, 4)) - firstYear) % everyYears === 0)
    .map((point) => point.date);
}

export function getUpcomingDebtInstallments(
  schedule: DebtScheduleRowOutput[],
  paidInstallments: number,
  count = 6,
) {
  return schedule.slice(paidInstallments, paidInstallments + count);
}

const genericImportError = "Não foi possível importar o extrato. Tente novamente.";
const unreadableStatement = "Não conseguimos ler este extrato. Nada foi importado.";
const importErrorMessages: Record<string, string> = {
  invalid_pdf: "O arquivo não é um PDF válido.",
  unsupported_statement: "Este PDF não é um extrato suportado. Por enquanto, só o DDC do Itaú.",
  statement_not_reproduced: "Os valores do extrato não bateram com o cálculo. Nada foi importado.",
  rate_limited: "Muitas importações seguidas. Aguarde um minuto e tente de novo.",
  unsupported_amortization_system: "Este financiamento não usa SAC, que é o único suportado agora.",
  unsupported_operation: unreadableStatement,
  unreadable_line: unreadableStatement,
  missing_field: unreadableStatement,
};

export function debtImportErrorMessage(code: string | undefined) {
  return (code && importErrorMessages[code]) || genericImportError;
}

export const maxDebtStatementBytes = 5 * 1024 * 1024;

export function validateDebtStatementFile(file: { name: string; type: string; size: number }) {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) return "Escolha um arquivo PDF.";
  if (file.size === 0) return "O arquivo está vazio.";
  if (file.size > maxDebtStatementBytes) return "O PDF passa de 5 MB.";
  return null;
}

const percentScale = 100;
/** The API stores the rate with six decimals, so a percentage keeps four. */
const rateDecimals = 1_000_000;

/** Parses a monthly percentage ("0,25") into a rate (0.0025); `null` when it is not valid. */
export function parseDebtCorrectionRate(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const rate = Math.round(Number(normalized) * (rateDecimals / percentScale)) / rateDecimals;
  return rate <= maxProjectedMonthlyCorrectionRate ? rate : null;
}

const correctionRateFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

export function formatDebtCorrectionRate(rate: number) {
  return correctionRateFormatter.format(rate * percentScale);
}

/** Share of the financed amount the balance has already come down by, between 0 and 1. */
export function getDebtAmortizedShare(debt: { principal: number; currentBalance: number }) {
  if (debt.principal <= 0) return 0;
  return Math.min(1, Math.max(0, (debt.principal - debt.currentBalance) / debt.principal));
}

const annualRateFormatter = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatDebtAnnualRate(rate: number) {
  return `${annualRateFormatter.format(rate)} a.a.`;
}

const shareFormatter = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatDebtShare(share: number) {
  return shareFormatter.format(share);
}

export function formatDebtMonth(date: string) {
  return formatPeriod(date.slice(0, 7), true);
}

export function formatDebtDate(date: string) {
  return formatDateInBrazil(dateOnlyToSafeInstant(date), {});
}

const bankLabels: Record<DebtStatementBank, string> = { itau: "Itaú" };

export function debtBankLabel(bank: DebtStatementBank) {
  return bankLabels[bank];
}

export function debtBankInitials(bank: DebtStatementBank) {
  return bankLabels[bank]
    .normalize("NFD")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 2)
    .toLocaleUpperCase("pt-BR");
}

const statusLabels: Record<DebtStatementInstallmentStatus, string> = {
  paid: "Paga",
  open: "Em aberto",
  projected: "Projetada",
};

export function debtInstallmentStatusLabel(status: DebtStatementInstallmentStatus) {
  return statusLabels[status];
}

const modeLabels: Record<DebtExtraAmortizationMode, string> = {
  reduceTerm: "Reduz prazo",
  reduceInstallment: "Reduz parcela",
};

export function debtExtraModeLabel(mode: DebtExtraAmortizationMode) {
  return modeLabels[mode];
}

const sourceLabels: Record<DebtExtraAmortizationSource, string> = {
  fgts: "FGTS",
  ownFunds: "Recursos próprios",
};

export function debtExtraSourceLabel(source: DebtExtraAmortizationSource) {
  return sourceLabels[source];
}

const chargeLabels: Record<string, string> = {
  mip: "Seguro MIP",
  dfi: "Seguro DFI",
  homeInsurance: "Seguro residencial",
  fee: "Tarifa",
  lateFee: "Multa",
  lateInterest: "Juros de mora",
  agreement: "Acordo",
};

export function debtChargeLabel(code: string) {
  return chargeLabels[code] ?? "Outros encargos";
}

export function sumDebtCharges(row: Pick<DebtScheduleRowOutput, "charges">) {
  return Math.round(row.charges.reduce((sum, charge) => sum + charge.amount * 100, 0)) / 100;
}

const debtExpensePaymentMethodLabels: Record<DebtExpensePaymentMethod, string> = {
  boleto: "Boleto",
  debit_card: "Cartão de débito",
  pix: "Pix",
  bank_transfer: "Transferência bancária",
};

/** Same labels as the transactions screens; a credit card has its own invoice flow. */
export const debtExpensePaymentMethodOptions = debtExpensePaymentMethods.map((value) => ({
  value,
  label: debtExpensePaymentMethodLabels[value],
}));

export function debtExpensePaymentMethodLabel(method: DebtExpensePaymentMethod) {
  return debtExpensePaymentMethodLabels[method];
}

export function formatDebtExpenseCounts(counts: { pending: number; settled: number }) {
  const parts = [
    counts.pending > 0
      ? `${counts.pending} ${counts.pending === 1 ? "parcela pendente" : "parcelas pendentes"}`
      : null,
    counts.settled > 0 ? `${counts.settled} ${counts.settled === 1 ? "paga" : "pagas"}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Nenhuma parcela lançada";
}

const genericExpensesError = "Não foi possível lançar as parcelas. Tente novamente.";
const expensesErrorMessages: Record<string, string> = {
  account_not_found: "Escolha uma conta ativa.",
  category_not_found: "Escolha uma categoria de despesa.",
  category_not_expense: "Escolha uma categoria de despesa.",
  debt_paid_off: "Esta dívida não tem parcelas a vencer.",
};

export function debtExpensesErrorMessage(code: string | undefined) {
  return (code && expensesErrorMessages[code]) || genericExpensesError;
}
