export const debtAmortizationSystems = ["sac"] as const;
export type DebtAmortizationSystem = (typeof debtAmortizationSystems)[number];

export const debtExtraAmortizationModes = ["reduceTerm", "reduceInstallment"] as const;
export type DebtExtraAmortizationMode = (typeof debtExtraAmortizationModes)[number];

export const debtChargeRuleTypes = ["balanceRate", "indexedAmount", "fixedAmount"] as const;
export type DebtChargeRuleType = (typeof debtChargeRuleTypes)[number];

export const debtScheduleRowStatuses = ["known", "projected"] as const;
export type DebtScheduleRowStatus = (typeof debtScheduleRowStatuses)[number];

export type DebtTerms = {
  principalCents: number;
  contractDate: string;
  termMonths: number;
  annualEffectiveRate: number;
  amortizationSystem: DebtAmortizationSystem;
};

export type DebtKnownInstallment = {
  dueDate: string;
  correctionFactor: number;
  charges?: Record<string, number>;
  /** Total actually billed, when the statement shows one; it may carry bank-side cent adjustments. */
  installmentCents?: number;
};

export type DebtExtraAmortization = {
  date: string;
  amountCents: number;
  proRataInterestCents: number;
  monetaryUpdateCents: number;
  mode: DebtExtraAmortizationMode;
};

export type DebtChargeRule =
  | { type: "balanceRate"; code: string; effectiveFrom: string; rate: number }
  | { type: "indexedAmount"; code: string; effectiveFrom: string; baseCents: number }
  | { type: "fixedAmount"; code: string; effectiveFrom: string; amountCents: number };

export type DebtScheduleInput = {
  terms: DebtTerms;
  knownInstallments: DebtKnownInstallment[];
  extraAmortizations: DebtExtraAmortization[];
  chargeRules: DebtChargeRule[];
  projection: { monthlyCorrectionFactor: number };
};

export type DebtScheduleCharge = { code: string; amountCents: number };

export type DebtScheduleRow = {
  number: number;
  dueDate: string;
  status: DebtScheduleRowStatus;
  correctionFactor: number;
  correctedBalanceCents: number;
  extraPrincipalCents: number;
  remainingTermMonths: number;
  amortizationCents: number;
  interestCents: number;
  charges: DebtScheduleCharge[];
  installmentCents: number;
  balanceAfterCents: number;
};

export type DebtTotals = {
  amortizationCents: number;
  interestCents: number;
  chargesCents: number;
  extraPrincipalCents: number;
};

export type DebtSummary = {
  currentBalanceCents: number;
  paidInstallments: number;
  remainingInstallments: number;
  monthsCut: number;
  paid: DebtTotals;
  remaining: DebtTotals;
};

export const debtScheduleErrorCodes = [
  "SCHEDULE_DID_NOT_CONVERGE",
  "TERM_ENDED_WITH_BALANCE",
] as const;
export type DebtScheduleErrorCode = (typeof debtScheduleErrorCodes)[number];

export class DebtScheduleError extends Error {
  constructor(public readonly code: DebtScheduleErrorCode) {
    super(code);
  }
}

/** Upper bound for generated installments; a 100-year monthly schedule means corrupted input. */
const maxScheduleInstallments = 1_200;
const factorScale = 1_000_000n;
const daysPerInterestMonth = 30;
const millisecondsPerDay = 86_400_000;

type CalendarDate = { year: number; month: number; day: number };

function parseDate(value: string): CalendarDate {
  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8, 10)),
  };
}

function formatDate({ year, month, day }: CalendarDate) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function daysBetween(start: CalendarDate, end: CalendarDate) {
  return (
    (Date.UTC(end.year, end.month - 1, end.day) -
      Date.UTC(start.year, start.month - 1, start.day)) /
    millisecondsPerDay
  );
}

function nextMonthlyDueDate(previous: CalendarDate, anchorDay: number): CalendarDate {
  const year = previous.month === 12 ? previous.year + 1 : previous.year;
  const month = previous.month === 12 ? 1 : previous.month + 1;
  return { year, month, day: Math.min(anchorDay, daysInMonth(year, month)) };
}

/** A period earns a full month of interest when it ends on the same day of the following month. */
function isFullMonthPeriod(previous: CalendarDate, next: CalendarDate) {
  const monthDistance = next.year * 12 + next.month - (previous.year * 12 + previous.month);
  if (monthDistance !== 1) return false;
  const nextIsMonthEnd = next.day === daysInMonth(next.year, next.month);
  const previousIsMonthEnd = previous.day === daysInMonth(previous.year, previous.month);
  return (
    next.day === previous.day ||
    (nextIsMonthEnd && previous.day > next.day) ||
    (previousIsMonthEnd && nextIsMonthEnd)
  );
}

/** Rounds half up, nudging by a few ulps so decimal ties stored as binary floats round as written. */
function roundHalfUp(value: number) {
  return Math.round(value * (1 + 4 * Number.EPSILON));
}

/** Integer division rounded half up, exact for non-negative safe integers. */
function divideHalfUp(numerator: number, denominator: number) {
  const quotient = Math.floor(numerator / denominator);
  const remainder = numerator - quotient * denominator;
  return remainder * 2 >= denominator ? quotient + 1 : quotient;
}

/** Applies a correction factor published with six decimals, exactly, to a balance in cents. */
function correctBalance(balanceCents: number, factor: number) {
  const scaled = BigInt(balanceCents) * BigInt(Math.round(factor * Number(factorScale)));
  const quotient = scaled / factorScale;
  return Number((scaled % factorScale) * 2n >= factorScale ? quotient + 1n : quotient);
}

function monthlyRateFromAnnualEffective(annualEffectiveRate: number) {
  return (1 + annualEffectiveRate) ** (1 / 12) - 1;
}

function interestForPeriod(
  correctedBalanceCents: number,
  monthlyRate: number,
  from: CalendarDate,
  to: CalendarDate,
) {
  if (isFullMonthPeriod(from, to)) return roundHalfUp(correctedBalanceCents * monthlyRate);
  const proRataRate = (1 + monthlyRate) ** (daysBetween(from, to) / daysPerInterestMonth) - 1;
  return roundHalfUp(correctedBalanceCents * proRataRate);
}

/**
 * Term after a "reduce term" extra amortization: the bank keeps the amortization + interest that
 * would have been due without the extra and solves for the number of months.
 */
function termKeepingInstallment(
  correctedBalanceCents: number,
  referenceInstallmentCents: number,
  monthlyRate: number,
) {
  const amortizationBudget =
    referenceInstallmentCents - roundHalfUp(correctedBalanceCents * monthlyRate);
  if (amortizationBudget <= 0) return 1;
  return Math.max(1, divideHalfUp(correctedBalanceCents, amortizationBudget));
}

/** Part of an extra amortization that reduces the balance; pro-rata interest and monetary update do not. */
export function extraAmortizationPrincipalCents(extra: DebtExtraAmortization) {
  return extra.amountCents - extra.proRataInterestCents - extra.monetaryUpdateCents;
}

type ChargeAccumulator = Map<DebtChargeRule, number>;

function activeChargeRules(rules: DebtChargeRule[], dueDate: string) {
  const active = new Map<string, DebtChargeRule>();
  for (const rule of rules) if (rule.effectiveFrom <= dueDate) active.set(rule.code, rule);
  return active;
}

function chargesForInstallment(
  rules: DebtChargeRule[],
  accumulator: ChargeAccumulator,
  dueDate: string,
  correctedBalanceCents: number,
  correctionFactor: number,
  actualCharges: Record<string, number>,
): DebtScheduleCharge[] {
  const active = activeChargeRules(rules, dueDate);
  const codes = [...new Set([...active.keys(), ...Object.keys(actualCharges)])].sort();
  return codes.map((code) => {
    const rule = active.get(code);
    let indexation = 1;
    if (rule?.type === "indexedAmount") {
      const previous = accumulator.get(rule);
      indexation = previous === undefined ? 1 : previous * correctionFactor;
      accumulator.set(rule, indexation);
    }
    const actual = actualCharges[code];
    if (actual !== undefined) return { code, amountCents: actual };
    if (rule?.type === "balanceRate")
      return { code, amountCents: roundHalfUp(correctedBalanceCents * rule.rate) };
    if (rule?.type === "indexedAmount")
      return { code, amountCents: roundHalfUp(rule.baseCents * indexation) };
    return { code, amountCents: rule?.type === "fixedAmount" ? rule.amountCents : 0 };
  });
}

/**
 * Builds the installment schedule of a SAC debt, reproducing bank statements to the cent.
 * Known installments carry the published correction factor and actual charges; after them the
 * schedule is projected monthly, on the same day, with the assumed correction factor.
 * Rules and rounding are documented in docs/debts.md.
 */
export function buildDebtSchedule(input: DebtScheduleInput): DebtScheduleRow[] {
  const { terms, knownInstallments, projection } = input;
  const monthlyRate = monthlyRateFromAnnualEffective(terms.annualEffectiveRate);
  const extras = [...input.extraAmortizations].sort((a, b) => a.date.localeCompare(b.date));
  const chargeRules = [...input.chargeRules].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom),
  );
  const chargeAccumulator: ChargeAccumulator = new Map();
  const lastKnownDueDate = knownInstallments.at(-1)?.dueDate;
  const anchorDay = parseDate(lastKnownDueDate ?? terms.contractDate).day;

  const rows: DebtScheduleRow[] = [];
  let balanceCents = terms.principalCents;
  let remainingTermMonths = terms.termMonths;
  let previousDueDate = parseDate(terms.contractDate);
  let nextExtra = 0;

  while (balanceCents > 0) {
    if (rows.length >= maxScheduleInstallments)
      throw new DebtScheduleError("SCHEDULE_DID_NOT_CONVERGE");
    if (remainingTermMonths < 1) throw new DebtScheduleError("TERM_ENDED_WITH_BALANCE");
    const known = knownInstallments[rows.length];
    const dueDate = known
      ? parseDate(known.dueDate)
      : nextMonthlyDueDate(previousDueDate, anchorDay);
    const dueDateText = formatDate(dueDate);
    const correctionFactor = known ? known.correctionFactor : projection.monthlyCorrectionFactor;

    let appliedExtraCents = 0;
    for (
      let extra = extras[nextExtra];
      extra && extra.date < dueDateText;
      extra = extras[++nextExtra]
    ) {
      const correctedBefore = correctBalance(balanceCents, correctionFactor);
      const referenceInstallmentCents =
        divideHalfUp(correctedBefore, remainingTermMonths) +
        roundHalfUp(correctedBefore * monthlyRate);
      const principalCents = extraAmortizationPrincipalCents(extra);
      balanceCents -= principalCents;
      appliedExtraCents += principalCents;
      if (extra.mode === "reduceTerm") {
        remainingTermMonths = termKeepingInstallment(
          correctBalance(balanceCents, correctionFactor),
          referenceInstallmentCents,
          monthlyRate,
        );
      }
    }

    const correctedBalanceCents = correctBalance(balanceCents, correctionFactor);
    const interestCents = interestForPeriod(
      correctedBalanceCents,
      monthlyRate,
      previousDueDate,
      dueDate,
    );
    const amortizationCents = divideHalfUp(correctedBalanceCents, remainingTermMonths);
    const charges = chargesForInstallment(
      chargeRules,
      chargeAccumulator,
      dueDateText,
      correctedBalanceCents,
      correctionFactor,
      known?.charges ?? {},
    );
    balanceCents = correctedBalanceCents - amortizationCents;

    rows.push({
      number: rows.length + 1,
      dueDate: dueDateText,
      status: known ? "known" : "projected",
      correctionFactor,
      correctedBalanceCents,
      extraPrincipalCents: appliedExtraCents,
      remainingTermMonths,
      amortizationCents,
      interestCents,
      charges,
      installmentCents:
        known?.installmentCents ??
        amortizationCents +
          interestCents +
          charges.reduce((sum, charge) => sum + charge.amountCents, 0),
      balanceAfterCents: balanceCents,
    });
    remainingTermMonths -= 1;
    previousDueDate = dueDate;
  }
  return rows;
}

function totalsOf(rows: DebtScheduleRow[]): DebtTotals {
  return rows.reduce<DebtTotals>(
    (totals, row) => ({
      amortizationCents: totals.amortizationCents + row.amortizationCents,
      interestCents: totals.interestCents + row.interestCents,
      chargesCents:
        totals.chargesCents + row.charges.reduce((sum, charge) => sum + charge.amountCents, 0),
      extraPrincipalCents: totals.extraPrincipalCents + row.extraPrincipalCents,
    }),
    { amortizationCents: 0, interestCents: 0, chargesCents: 0, extraPrincipalCents: 0 },
  );
}

/**
 * Splits a schedule into paid (due on or before `asOf`) and remaining installments.
 *
 * An extra amortization is applied to the next installment, but the balance drops on the day it is
 * made. So the current balance is the balance after the last due installment minus the principal of
 * the extras made since that due date (one made on a due date is applied after that installment),
 * and extras count as paid by their own date, not by the installment that carries them.
 */
export function summarizeDebtSchedule(
  terms: DebtTerms,
  rows: DebtScheduleRow[],
  extraAmortizations: DebtExtraAmortization[],
  asOf: string,
): DebtSummary {
  const paidRows = rows.filter((row) => row.dueDate <= asOf);
  const remainingRows = rows.filter((row) => row.dueDate > asOf);
  const lastPaidRow = paidRows.at(-1);
  const madeExtras = extraAmortizations.filter((extra) => extra.date <= asOf);
  const principalOf = (extras: DebtExtraAmortization[]) =>
    extras.reduce((sum, extra) => sum + extraAmortizationPrincipalCents(extra), 0);
  const extrasSinceLastPaid = madeExtras.filter(
    (extra) => !lastPaidRow || extra.date >= lastPaidRow.dueDate,
  );
  return {
    currentBalanceCents:
      (lastPaidRow?.balanceAfterCents ?? terms.principalCents) - principalOf(extrasSinceLastPaid),
    paidInstallments: paidRows.length,
    remainingInstallments: remainingRows.length,
    monthsCut: terms.termMonths - rows.length,
    paid: { ...totalsOf(paidRows), extraPrincipalCents: principalOf(madeExtras) },
    remaining: {
      ...totalsOf(remainingRows),
      extraPrincipalCents: principalOf(extraAmortizations.filter((extra) => extra.date > asOf)),
    },
  };
}
