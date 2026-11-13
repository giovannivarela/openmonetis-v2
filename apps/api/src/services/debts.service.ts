import {
  type DebtExpensePaymentMethod,
  type DebtExpenseRecord,
  type DebtInstallmentForExpense,
  debtInstallmentExpenseNamePrefix,
  planDebtInstallmentExpenses,
} from "@openmonetis/domain/debt-expenses";
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
  extraAmortizationPrincipalCents,
  summarizeDebtSchedule,
  summarizeDebtScheduleYears,
} from "@openmonetis/domain/debts";
import { fromCents } from "@openmonetis/domain/money";
import {
  deriveTransactionPeriod,
  normalizeTransactionAmount,
} from "@openmonetis/domain/transactions";
import { getCurrentDateInBrazil } from "@openmonetis/shared/date-time";
import type {
  DebtDetailOutput,
  DebtExpensesInput,
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
  expenses: DebtExpenseSettings | null;
  statementIssuedOn: string;
  statement: DebtStatement;
  createdAt: Date;
  updatedAt: Date;
};

export type DebtExpenseSettings = {
  accountId: string;
  categoryId: string;
  paymentMethod: DebtExpensePaymentMethod;
  fromInstallment: number;
};

/** The fields of an installment expense that follow the schedule. `amount` is signed. */
export type DebtExpenseWrite = {
  installmentNumber: number;
  amount: string;
  dueDate: string;
  period: string;
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
  /** Deletes the debt and its pending expenses; paid expenses stay, unlinked. */
  deleteForUser(id: string, userId: string): Promise<{ id: string } | null>;
  findExpenseTarget(
    userId: string,
    accountId: string,
    categoryId: string,
  ): Promise<{
    account: { archived: boolean } | null;
    category: { type: "income" | "expense" } | null;
    adminPersonId: string;
  }>;
  listInstallmentExpenses(debtId: string, userId: string): Promise<DebtExpenseRecord[]>;
  /**
   * In one transaction: saves the settings, removes, updates and creates the planned expenses,
   * then points every pending expense at the settings and names it `namePrefix` + its number.
   */
  saveInstallmentExpenses(data: {
    userId: string;
    debtId: string;
    personId: string;
    settings: DebtExpenseSettings;
    namePrefix: string;
    create: Array<DebtExpenseWrite & { name: string }>;
    update: Array<DebtExpenseWrite & { id: string }>;
    remove: string[];
  }): Promise<void>;
  /** Removes the pending expenses and clears the settings; paid expenses stay. */
  disableInstallmentExpenses(debtId: string, userId: string): Promise<void>;
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

/** The schedule fields an installment expense carries; the amount is a signed expense. */
function expenseWrite(
  installment: DebtInstallmentForExpense,
  paymentMethod: DebtExpensePaymentMethod,
) {
  return {
    installmentNumber: installment.number,
    amount: normalizeTransactionAmount("expense", fromCents(installment.installmentCents)).toFixed(
      2,
    ),
    dueDate: installment.dueDate,
    period: deriveTransactionPeriod({
      paymentMethod,
      purchaseDate: installment.dueDate,
      dueDate: installment.dueDate,
    }),
  };
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
        paidOut: fromCents(summary.paidOutCents),
        paidInstallments: summary.paidInstallments,
        remainingInstallments: summary.remainingInstallments,
        monthsCut: summary.monthsCut,
        lastDueDate: summary.lastDueDate,
        paid: totalsOutput(summary.paid),
        remaining: totalsOutput(summary.remaining),
      },
      nextInstallment: next
        ? { number: next.number, dueDate: next.dueDate, amount: fromCents(next.installmentCents) }
        : null,
      expenses: record.expenses,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async function detail(record: DebtRecord): Promise<DebtDetailOutput> {
    const rows = scheduleOf(record);
    const launched = await repository.listInstallmentExpenses(record.id, record.userId);
    const { extraAmortizations } = record.statement;
    return {
      ...output(record, rows),
      schedule: rows.map((row) => rowOutput(row, record.statement)),
      extraAmortizations: extraAmortizations.map((extra) => ({
        date: extra.date,
        amount: fromCents(extra.amountCents),
        proRataInterest: fromCents(extra.proRataInterestCents),
        monetaryUpdate: fromCents(extra.monetaryUpdateCents),
        principal: fromCents(extraAmortizationPrincipalCents(extra)),
        mode: extra.mode,
        source: extra.source,
      })),
      yearlyBreakdown: summarizeDebtScheduleYears(rows, extraAmortizations, today()).map(
        (year) => ({
          year: year.year,
          installments: year.installments,
          amortization: fromCents(year.amortizationCents),
          interest: fromCents(year.interestCents),
          charges: fromCents(year.chargesCents),
          total: fromCents(year.installmentCents),
          extraPrincipal: fromCents(year.extraPrincipalCents),
          remainingOnly: year.remainingOnly,
        }),
      ),
      expenseCounts: {
        pending: launched.filter((expense) => !expense.settled).length,
        settled: launched.filter((expense) => expense.settled).length,
      },
    };
  }

  /** Brings the debt's expenses in line with its schedule and settings. */
  async function syncExpenses(record: DebtRecord, settings: DebtExpenseSettings, personId: string) {
    const installments = scheduleOf(record).map((row) => ({
      number: row.number,
      dueDate: row.dueDate,
      installmentCents: row.installmentCents,
    }));
    const plan = planDebtInstallmentExpenses({
      installments,
      existing: await repository.listInstallmentExpenses(record.id, record.userId),
      fromInstallment: settings.fromInstallment,
    });
    const namePrefix = debtInstallmentExpenseNamePrefix(record.name);
    await repository.saveInstallmentExpenses({
      userId: record.userId,
      debtId: record.id,
      personId,
      settings,
      namePrefix,
      create: plan.create.map((installment) => ({
        ...expenseWrite(installment, settings.paymentMethod),
        name: `${namePrefix}${installment.number}`,
      })),
      update: plan.update.map(({ id, installment }) => ({
        id,
        ...expenseWrite(installment, settings.paymentMethod),
      })),
      remove: plan.remove,
    });
  }

  /** Re-syncs after the schedule or the name changed; a debt without expenses is left alone. */
  async function resyncExpenses(record: DebtRecord) {
    if (!record.expenses) return;
    const target = await repository.findExpenseTarget(
      record.userId,
      record.expenses.accountId,
      record.expenses.categoryId,
    );
    await syncExpenses(record, record.expenses, target.adminPersonId);
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
      return await detail(await requireDebt(id, userId));
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
      const record = await requireDebt(id, userId);
      await resyncExpenses(record);
      return await detail(record);
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
      await resyncExpenses(record);
      return output(record, scheduleOf(record));
    },

    async enableExpenses(
      id: string,
      userId: string,
      input: DebtExpensesInput,
    ): Promise<DebtDetailOutput> {
      const record = await requireDebt(id, userId);
      const target = await repository.findExpenseTarget(userId, input.accountId, input.categoryId);
      if (!target.account || target.account.archived) {
        throw notFound("Conta não encontrada.", "account_not_found");
      }
      if (!target.category) throw notFound("Categoria não encontrada.", "category_not_found");
      if (target.category.type !== "expense") {
        throw badRequest("Escolha uma categoria de despesa.", "category_not_expense");
      }
      const next = scheduleOf(record).find((row) => row.dueDate > today());
      const fromInstallment = record.expenses?.fromInstallment ?? next?.number;
      if (fromInstallment === undefined) {
        throw badRequest("Esta dívida não tem parcelas a vencer.", "debt_paid_off");
      }
      await syncExpenses(record, { ...input, fromInstallment }, target.adminPersonId);
      return await detail(await requireDebt(id, userId));
    },

    async disableExpenses(id: string, userId: string): Promise<DebtDetailOutput> {
      const record = await requireDebt(id, userId);
      await repository.disableInstallmentExpenses(record.id, userId);
      return await detail(await requireDebt(id, userId));
    },

    async remove(id: string, userId: string): Promise<{ id: string }> {
      const removed = await repository.deleteForUser(id, userId);
      if (!removed) throw debtNotFound();
      return removed;
    },
  };
}

export type DebtsService = ReturnType<typeof createDebtsService>;
