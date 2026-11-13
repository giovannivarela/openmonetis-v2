import {
  type DebtExtraAmortizationSource,
  type DebtStatement,
  DebtStatementError,
  type DebtStatementExtraAmortization,
  type DebtStatementInstallment,
  type DebtStatementInstallmentStatus,
  type DebtStatementReader,
} from "./debt-statements";
import type { DebtChargeRuleType, DebtExtraAmortizationMode } from "./debts";

/**
 * Reader for Itaú's "Demonstrativo Descritivo de Crédito" (DDC) of housing loans.
 * Strict on purpose: a table line it cannot read, an operation it does not know or another
 * amortization system raises an error instead of producing wrong numbers.
 */

const statementTitle = "Demonstrativo Descritivo de Crédito (DDC)";
const rowStart = /^\d{1,3} \d{2}\/\d{2}\/\d{4}\b/;
const rowPattern = /^(\d{1,3}) (\d{2}\/\d{2}\/\d{4}) (.+) (Paga|Aberta|Projetada) (\S+) (\S+)$/;
const operationPattern = /^Operação: (.+?) Data: (\d{2}\/\d{2}\/\d{4})(.*)$/;
const extraAmortizationPattern = /^Amortizacao reducao de (prazo|parcela) (.+)$/;
const amountPattern = /^(-?)(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/;

const statusByLabel: Record<string, DebtStatementInstallmentStatus> = {
  Paga: "paid",
  Aberta: "open",
  Projetada: "projected",
};

const modeByLabel: Record<string, DebtExtraAmortizationMode> = {
  prazo: "reduceTerm",
  parcela: "reduceInstallment",
};

/**
 * Table columns between the interest and the balance-correction index, in order.
 * "Ajuste Financeiro" and "FGTS Mensal" are not charges: the bank leaves them out of the total.
 */
const rowColumns = [
  "amortization",
  "interest",
  "installmentIndex",
  "mip",
  "dfi",
  "homeInsurance",
  "fee",
  "lateFee",
  "lateInterest",
  "adjustment",
  "fgtsMonthly",
  "balanceIndex",
  "agreement",
] as const;

const chargeColumns = [
  "mip",
  "dfi",
  "homeInsurance",
  "fee",
  "lateFee",
  "lateInterest",
  "agreement",
] as const satisfies readonly (typeof rowColumns)[number][];

const chargeKinds: Record<(typeof chargeColumns)[number], DebtChargeRuleType> = {
  mip: "balanceRate",
  dfi: "indexedAmount",
  homeInsurance: "fixedAmount",
  fee: "fixedAmount",
  lateFee: "fixedAmount",
  lateInterest: "fixedAmount",
  agreement: "fixedAmount",
};

function parseCents(value: string, line: string) {
  const match = amountPattern.exec(value);
  if (!match) throw new DebtStatementError("UNREADABLE_LINE", line);
  const cents = Number(`${(match[2] ?? "").replaceAll(".", "")}${match[3]}`);
  return match[1] ? -cents : cents;
}

function parseBrazilianDate(value: string) {
  return `${value.slice(6, 10)}-${value.slice(3, 5)}-${value.slice(0, 2)}`;
}

/** "10,490000000" (percent) → 0.1049, shifting the decimal point in text to avoid float division. */
function parsePercentRate(value: string) {
  const [integerPart = "", fractionPart = ""] = value.replaceAll(".", "").split(",");
  const padded = integerPart.padStart(3, "0");
  return Number(`${padded.slice(0, -2)}.${padded.slice(-2)}${fractionPart}`);
}

function findField(lines: string[], pattern: RegExp, field: string) {
  for (const line of lines) {
    const match = pattern.exec(line);
    if (match?.[1]) return match[1];
  }
  throw new DebtStatementError("MISSING_FIELD", field);
}

function operationAmount(details: string, label: string, line: string) {
  const match = new RegExp(`${label}: (\\S+)`).exec(details);
  return match?.[1] ? parseCents(match[1], line) : 0;
}

function parseInstallment(line: string): DebtStatementInstallment {
  const match = rowPattern.exec(line);
  const values = match?.[3]?.split(" ") ?? [];
  if (!match || values.length !== rowColumns.length)
    throw new DebtStatementError("UNREADABLE_LINE", line);
  const column = (name: (typeof rowColumns)[number]) => values[rowColumns.indexOf(name)] ?? "";
  const charges: Record<string, number> = {};
  for (const code of chargeColumns) {
    const cents = parseCents(column(code), line);
    if (cents !== 0) charges[code] = cents;
  }
  for (const index of ["installmentIndex", "balanceIndex"] as const) {
    if (!/^\d+,\d{4}$/.test(column(index))) throw new DebtStatementError("UNREADABLE_LINE", line);
  }
  parseCents(column("adjustment"), line);
  parseCents(column("fgtsMonthly"), line);
  return {
    number: Number(match[1]),
    dueDate: parseBrazilianDate(match[2] ?? ""),
    status: statusByLabel[match[4] ?? ""] ?? "projected",
    amortizationCents: parseCents(column("amortization"), line),
    interestCents: parseCents(column("interest"), line),
    charges,
    installmentCents: parseCents(match[5] ?? "", line),
    balanceAfterCents: parseCents(match[6] ?? "", line),
  };
}

function extraAmortizationSource(label: string, line: string): DebtExtraAmortizationSource {
  if (/fgts/i.test(label)) return "fgts";
  if (/recurso proprio/i.test(label)) return "ownFunds";
  throw new DebtStatementError("UNSUPPORTED_OPERATION", line);
}

function read(lines: string[]): DebtStatement {
  const installments: DebtStatementInstallment[] = [];
  const extraAmortizations: DebtStatementExtraAmortization[] = [];
  let contractStart: { date: string; principalCents: number } | undefined;

  for (const line of lines) {
    if (rowStart.test(line)) {
      installments.push(parseInstallment(line));
      continue;
    }
    if (!line.startsWith("Operação:")) continue;
    const operation = operationPattern.exec(line);
    if (!operation) throw new DebtStatementError("UNREADABLE_LINE", line);
    const [, description = "", date = "", details = ""] = operation;
    if (description.startsWith("Implantacao de contrato")) {
      contractStart = {
        date: parseBrazilianDate(date),
        principalCents: operationAmount(details, "Valor da Operação", line),
      };
      continue;
    }
    if (description.startsWith("Alteracao de dia de vencimento")) continue;
    const extra = extraAmortizationPattern.exec(description);
    if (!extra) throw new DebtStatementError("UNSUPPORTED_OPERATION", line);
    const amountCents = operationAmount(details, "Valor da Operação", line);
    if (amountCents <= 0) throw new DebtStatementError("UNREADABLE_LINE", line);
    extraAmortizations.push({
      date: parseBrazilianDate(date),
      amountCents,
      proRataInterestCents: operationAmount(details, "Juros Pró-rata", line),
      monetaryUpdateCents: operationAmount(details, "Atualização monetária", line),
      mode: modeByLabel[extra[1] ?? ""] ?? "reduceTerm",
      source: extraAmortizationSource(extra[2] ?? "", line),
    });
  }

  if (!contractStart) throw new DebtStatementError("MISSING_FIELD", "contract start");
  const first = installments[0];
  if (!first || first.amortizationCents <= 0)
    throw new DebtStatementError("MISSING_FIELD", "installments");
  const amortizationSystem = findField(
    lines,
    /^Sistema de amortização (\S+)/,
    "amortization system",
  );
  if (amortizationSystem !== "SAC")
    throw new DebtStatementError("UNSUPPORTED_AMORTIZATION_SYSTEM", amortizationSystem);
  const issuedOn = findField(lines, /Emitido em (\d{1,2}\.\d{1,2}\.\d{4})/, "issue date");
  const [day = "", month = "", year = ""] = issuedOn.split(".");
  const firstCorrectedBalance = first.balanceAfterCents + first.amortizationCents;

  return {
    bank: "itau",
    format: "ddc",
    issuedOn: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
    contractReference: findField(lines, /Número do contrato (\S+)/, "contract reference"),
    terms: {
      principalCents: contractStart.principalCents,
      contractDate: contractStart.date,
      termMonths: Math.round(firstCorrectedBalance / first.amortizationCents),
      annualEffectiveRate: parsePercentRate(
        findField(lines, /Taxa efetiva \(anual\) ([\d.,]+)%/, "effective rate"),
      ),
      amortizationSystem: "sac",
    },
    installments,
    extraAmortizations: extraAmortizations.sort((a, b) => a.date.localeCompare(b.date)),
    chargeKinds,
  };
}

export const itauDdcStatementReader: DebtStatementReader = {
  bank: "itau",
  format: "ddc",
  matches: (lines) => lines.some((line) => line.includes(statementTitle)),
  read,
};
