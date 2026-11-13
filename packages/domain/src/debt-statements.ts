import {
  type DebtChargeRule,
  type DebtChargeRuleType,
  type DebtExtraAmortization,
  type DebtKnownInstallment,
  type DebtScheduleInput,
  type DebtTerms,
  extraAmortizationPrincipalCents,
} from "./debts";

export const debtStatementBanks = ["itau"] as const;
export type DebtStatementBank = (typeof debtStatementBanks)[number];

export const debtStatementInstallmentStatuses = ["paid", "open", "projected"] as const;
export type DebtStatementInstallmentStatus = (typeof debtStatementInstallmentStatuses)[number];

export const debtExtraAmortizationSources = ["ownFunds", "fgts"] as const;
export type DebtExtraAmortizationSource = (typeof debtExtraAmortizationSources)[number];

export type DebtStatementInstallment = {
  number: number;
  dueDate: string;
  status: DebtStatementInstallmentStatus;
  amortizationCents: number;
  interestCents: number;
  /** Non-zero charges billed with the installment, by charge code. */
  charges: Record<string, number>;
  installmentCents: number;
  balanceAfterCents: number;
};

export type DebtStatementExtraAmortization = DebtExtraAmortization & {
  source: DebtExtraAmortizationSource;
};

export type DebtStatement = {
  bank: DebtStatementBank;
  format: string;
  issuedOn: string;
  contractReference: string;
  terms: DebtTerms;
  installments: DebtStatementInstallment[];
  extraAmortizations: DebtStatementExtraAmortization[];
  /** How each charge code behaves, so projected charges can be turned into rules. */
  chargeKinds: Record<string, DebtChargeRuleType>;
};

export type DebtStatementReader = {
  bank: DebtStatementBank;
  format: string;
  matches(lines: string[]): boolean;
  read(lines: string[]): DebtStatement;
};

export const debtStatementErrorCodes = [
  "UNSUPPORTED_STATEMENT",
  "UNSUPPORTED_AMORTIZATION_SYSTEM",
  "UNSUPPORTED_OPERATION",
  "UNREADABLE_LINE",
  "MISSING_FIELD",
] as const;
export type DebtStatementErrorCode = (typeof debtStatementErrorCodes)[number];

export class DebtStatementError extends Error {
  constructor(
    public readonly code: DebtStatementErrorCode,
    public readonly detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

const factorScale = 1_000_000n;

/** Correction factor implied by two balances, rounded half up to the six decimals TR is published with. */
function impliedCorrectionFactor(correctedBalanceCents: number, balanceBeforeCents: number) {
  const numerator = BigInt(correctedBalanceCents) * factorScale * 2n + BigInt(balanceBeforeCents);
  return Number(numerator / (BigInt(balanceBeforeCents) * 2n)) / Number(factorScale);
}

function correctedBalanceOf(installment: DebtStatementInstallment) {
  return installment.balanceAfterCents + installment.amortizationCents;
}

/** The widest rate interval that rounds (half up) a balance to the billed charge. */
function rateIntervalFor(installment: DebtStatementInstallment, code: string) {
  const balance = correctedBalanceOf(installment);
  const chargeCents = installment.charges[code] ?? 0;
  return { low: (chargeCents - 0.5) / balance, high: (chargeCents + 0.5) / balance };
}

/**
 * Turns balance-proportional charges into rate bands: consecutive installments share a rule while
 * one rate reproduces all of them, so age-band changes and a final zero become new rules.
 */
function balanceRateRules(projected: DebtStatementInstallment[], code: string): DebtChargeRule[] {
  const rules: DebtChargeRule[] = [];
  let band: { effectiveFrom: string; low: number; high: number } | undefined;
  const close = () => {
    if (!band) return;
    const rate = band.low <= 0 && band.high > 0 ? 0 : (band.low + band.high) / 2;
    rules.push({ type: "balanceRate", code, effectiveFrom: band.effectiveFrom, rate });
  };
  for (const installment of projected) {
    const { low, high } = rateIntervalFor(installment, code);
    if (band && Math.max(band.low, low) < Math.min(band.high, high)) {
      band = { ...band, low: Math.max(band.low, low), high: Math.min(band.high, high) };
      continue;
    }
    close();
    band = { effectiveFrom: installment.dueDate, low, high };
  }
  close();
  return rules;
}

/** Fixed and indexed charges become a new rule at every change of the projected amount. */
function amountRules(
  projected: DebtStatementInstallment[],
  code: string,
  type: "fixedAmount" | "indexedAmount",
): DebtChargeRule[] {
  const rules: DebtChargeRule[] = [];
  let previous: number | undefined;
  for (const installment of projected) {
    const cents = installment.charges[code] ?? 0;
    if (cents === previous) continue;
    previous = cents;
    rules.push(
      type === "fixedAmount"
        ? { type, code, effectiveFrom: installment.dueDate, amountCents: cents }
        : { type, code, effectiveFrom: installment.dueDate, baseCents: cents },
    );
  }
  return rules;
}

function chargeRulesFromProjection(statement: DebtStatement): DebtChargeRule[] {
  const projected = statement.installments.filter(
    (installment) => installment.status === "projected",
  );
  const codes = [
    ...new Set(projected.flatMap((installment) => Object.keys(installment.charges))),
  ].sort();
  return codes.flatMap((code) => {
    const kind = statement.chargeKinds[code] ?? "fixedAmount";
    return kind === "balanceRate"
      ? balanceRateRules(projected, code)
      : amountRules(projected, code, kind);
  });
}

/**
 * Converts a statement into engine input. Paid and open installments become known installments,
 * with the correction factor implied by consecutive balances and the billed charges and totals.
 * Charges the bank projected become rules, so the projection follows the bank's own numbers.
 */
export function scheduleInputFromStatement(
  statement: DebtStatement,
  projection: DebtScheduleInput["projection"],
): DebtScheduleInput {
  const extraAmortizations: DebtExtraAmortization[] = [...statement.extraAmortizations]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ source: _source, ...extra }) => extra);
  const knownInstallments: DebtKnownInstallment[] = [];
  let balanceCents = statement.terms.principalCents;
  let nextExtra = 0;
  for (const installment of statement.installments) {
    if (installment.status === "projected") break;
    for (
      let extra = extraAmortizations[nextExtra];
      extra && extra.date < installment.dueDate;
      extra = extraAmortizations[++nextExtra]
    ) {
      balanceCents -= extraAmortizationPrincipalCents(extra);
    }
    knownInstallments.push({
      dueDate: installment.dueDate,
      correctionFactor: impliedCorrectionFactor(correctedBalanceOf(installment), balanceCents),
      charges: installment.charges,
      installmentCents: installment.installmentCents,
    });
    balanceCents = installment.balanceAfterCents;
  }
  return {
    terms: statement.terms,
    knownInstallments,
    extraAmortizations,
    chargeRules: chargeRulesFromProjection(statement),
    projection,
  };
}
