import { readDebtStatement } from "@openmonetis/domain/debt-statement-readers";
import {
  type DebtStatement,
  type DebtStatementBank,
  DebtStatementError,
  type DebtStatementErrorCode,
  findStatementDivergences,
  scheduleInputFromStatement,
} from "@openmonetis/domain/debt-statements";
import {
  buildDebtSchedule,
  DebtScheduleError,
  type DebtScheduleRow,
  type DebtTotals,
  summarizeDebtSchedule,
} from "@openmonetis/domain/debts";
import { fromCents } from "@openmonetis/domain/money";
import { getCurrentDateInBrazil } from "@openmonetis/shared/date-time";
import type {
  DebtDetailOutput,
  DebtOutput,
  DebtScheduleRowOutput,
  ImportDebtStatementInput,
  UpdateDebtInput,
} from "@openmonetis/validators/debts";
import { badRequest, notFound } from "../utils/errors";
import { extractPdfTextLines, PdfTextError } from "../utils/pdf-text-lines";

export type DebtRecord = {
  id: string;
  userId: string;
  name: string;
  bank: DebtStatementBank;
  statementFormat: string;
  contractReference: string;
  projectedMonthlyCorrectionRate: string;
  statementIssuedOn: string;
  statement: DebtStatement;
  createdAt: Date;
  updatedAt: Date;
};

export type DebtsRepository = {
  listByUser(userId: string): Promise<DebtRecord[]>;
  findByIdForUser(id: string, userId: string): Promise<DebtRecord | null>;
  saveImport(data: {
    userId: string;
    defaultName: string;
    bank: DebtStatementBank;
    statementFormat: string;
    contractReference: string;
    issuedOn: string;
    statement: DebtStatement;
  }): Promise<{ id: string }>;
  updateForUser(
    id: string,
    userId: string,
    data: { name?: string; projectedMonthlyCorrectionRate?: string },
  ): Promise<{ id: string } | null>;
  deleteForUser(id: string, userId: string): Promise<{ id: string } | null>;
};

export type PdfTextReader = (pdf: Uint8Array) => Promise<string[]>;

const pdfSignature = "%PDF-";
const contractReferenceSuffixLength = 4;
const bankDisplayNames: Record<DebtStatementBank, string> = { itau: "Itaú" };

const statementErrorMessages: Record<DebtStatementErrorCode, string> = {
  UNSUPPORTED_STATEMENT: "This PDF is not a supported loan statement",
  UNSUPPORTED_AMORTIZATION_SYSTEM: "The amortization system of this loan is not supported yet",
  UNSUPPORTED_OPERATION: "The statement has an operation that cannot be read yet",
  UNREADABLE_LINE: "Some lines of the statement could not be read",
  MISSING_FIELD: "Some fields of the statement could not be read",
};

function invalidPdf() {
  return badRequest("The file is not a readable PDF", "invalid_pdf");
}

function debtNotFound() {
  return notFound("Debt not found", "debt_not_found");
}

function totalsOutput(totals: DebtTotals) {
  return {
    amortization: fromCents(totals.amortizationCents),
    interest: fromCents(totals.interestCents),
    charges: fromCents(totals.chargesCents),
    extraPrincipal: fromCents(totals.extraPrincipalCents),
  };
}

function rowOutput(row: DebtScheduleRow, statement: DebtStatement): DebtScheduleRowOutput {
  // By number, not by position: a statement does not have to list its installments from the first.
  const known =
    row.status === "known"
      ? statement.installments.find((installment) => installment.number === row.number)
      : undefined;
  return {
    number: row.number,
    dueDate: row.dueDate,
    status: known?.status ?? "projected",
    amortization: fromCents(row.amortizationCents),
    interest: fromCents(row.interestCents),
    charges: row.charges
      .filter((charge) => charge.amountCents !== 0)
      .map((charge) => ({ code: charge.code, amount: fromCents(charge.amountCents) })),
    installment: fromCents(row.installmentCents),
    balanceAfter: fromCents(row.balanceAfterCents),
    extraPrincipal: fromCents(row.extraPrincipalCents),
    remainingTermMonths: row.remainingTermMonths,
  };
}

/**
 * Debts imported from bank statements. The schedule is never stored: it is rebuilt by the domain
 * engine from the latest statement, so stored data and financial rules cannot drift apart.
 */
export function createDebtsService(
  repository: DebtsRepository,
  readPdfText: PdfTextReader = extractPdfTextLines,
  today: () => string = getCurrentDateInBrazil,
) {
  function scheduleOf(record: DebtRecord) {
    const monthlyCorrectionFactor = 1 + Number(record.projectedMonthlyCorrectionRate);
    return buildDebtSchedule(
      scheduleInputFromStatement(record.statement, { monthlyCorrectionFactor }),
    );
  }

  function output(record: DebtRecord, rows: DebtScheduleRow[]): DebtOutput {
    const { terms } = record.statement;
    const asOf = today();
    const summary = summarizeDebtSchedule(terms, rows, record.statement.extraAmortizations, asOf);
    // Same split as the summary: an installment due today is already paid.
    const next = rows.find((row) => row.dueDate > asOf);
    return {
      id: record.id,
      name: record.name,
      bank: record.bank,
      statementFormat: record.statementFormat,
      contractReferenceSuffix: record.contractReference.slice(-contractReferenceSuffixLength),
      statementIssuedOn: record.statementIssuedOn,
      projectedMonthlyCorrectionRate: Number(record.projectedMonthlyCorrectionRate),
      terms: {
        principal: fromCents(terms.principalCents),
        contractDate: terms.contractDate,
        termMonths: terms.termMonths,
        annualEffectiveRate: terms.annualEffectiveRate,
        amortizationSystem: terms.amortizationSystem,
      },
      summary: {
        currentBalance: fromCents(summary.currentBalanceCents),
        paidInstallments: summary.paidInstallments,
        remainingInstallments: summary.remainingInstallments,
        monthsCut: summary.monthsCut,
        paid: totalsOutput(summary.paid),
        remaining: totalsOutput(summary.remaining),
      },
      nextInstallment: next
        ? { number: next.number, dueDate: next.dueDate, amount: fromCents(next.installmentCents) }
        : null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  function detail(record: DebtRecord): DebtDetailOutput {
    const rows = scheduleOf(record);
    return {
      ...output(record, rows),
      schedule: rows.map((row) => rowOutput(row, record.statement)),
      extraAmortizations: record.statement.extraAmortizations.map((extra) => ({
        date: extra.date,
        amount: fromCents(extra.amountCents),
        proRataInterest: fromCents(extra.proRataInterestCents),
        monetaryUpdate: fromCents(extra.monetaryUpdateCents),
        mode: extra.mode,
        source: extra.source,
      })),
    };
  }

  async function requireDebt(id: string, userId: string) {
    const record = await repository.findByIdForUser(id, userId);
    if (!record) throw debtNotFound();
    return record;
  }

  async function readStatement(contentBase64: string): Promise<DebtStatement> {
    const pdf = Buffer.from(contentBase64, "base64");
    if (pdf.subarray(0, pdfSignature.length).toString("latin1") !== pdfSignature)
      throw invalidPdf();
    let statement: DebtStatement;
    try {
      statement = readDebtStatement(await readPdfText(new Uint8Array(pdf)));
    } catch (error) {
      if (error instanceof PdfTextError) throw invalidPdf();
      if (error instanceof DebtStatementError) {
        throw badRequest(statementErrorMessages[error.code], error.code.toLowerCase());
      }
      throw error;
    }
    let divergences: number[];
    try {
      divergences = findStatementDivergences(statement);
    } catch (error) {
      if (!(error instanceof DebtScheduleError)) throw error;
      divergences = [0];
    }
    if (divergences.length > 0) {
      throw badRequest(
        "The statement values could not be reproduced; nothing was imported",
        "statement_not_reproduced",
      );
    }
    return statement;
  }

  return {
    async list(userId: string): Promise<DebtOutput[]> {
      const records = await repository.listByUser(userId);
      return records.map((record) => output(record, scheduleOf(record)));
    },

    async get(id: string, userId: string): Promise<DebtDetailOutput> {
      return detail(await requireDebt(id, userId));
    },

    async importStatement(
      input: ImportDebtStatementInput,
      userId: string,
    ): Promise<DebtDetailOutput> {
      const statement = await readStatement(input.contentBase64);
      const suffix = statement.contractReference.slice(-contractReferenceSuffixLength);
      const { id } = await repository.saveImport({
        userId,
        defaultName: `Financiamento ${bankDisplayNames[statement.bank]} •••${suffix}`,
        bank: statement.bank,
        statementFormat: statement.format,
        contractReference: statement.contractReference,
        issuedOn: statement.issuedOn,
        statement,
      });
      return detail(await requireDebt(id, userId));
    },

    async update(id: string, userId: string, input: UpdateDebtInput): Promise<DebtOutput> {
      const updated = await repository.updateForUser(id, userId, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.projectedMonthlyCorrectionRate === undefined
          ? {}
          : { projectedMonthlyCorrectionRate: input.projectedMonthlyCorrectionRate.toFixed(6) }),
      });
      if (!updated) throw debtNotFound();
      const record = await requireDebt(updated.id, userId);
      return output(record, scheduleOf(record));
    },

    async remove(id: string, userId: string): Promise<{ id: string }> {
      const removed = await repository.deleteForUser(id, userId);
      if (!removed) throw debtNotFound();
      return removed;
    },
  };
}

export type DebtsService = ReturnType<typeof createDebtsService>;
