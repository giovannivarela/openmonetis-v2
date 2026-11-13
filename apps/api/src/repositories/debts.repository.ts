import {
  categories,
  db,
  debtStatements,
  debts,
  financialAccounts,
  people,
  transactions,
} from "@openmonetis/db";
import { and, asc, desc, eq, inArray, isNotNull, not, sql } from "drizzle-orm";
import {
  type DebtExpenseSettings,
  DebtExpensesConflictError,
  type DebtRecord,
  type DebtsRepository,
} from "../services/debts.service";

const debtColumns = {
  id: debts.id,
  userId: debts.userId,
  name: debts.name,
  bank: debts.bank,
  statementFormat: debts.statementFormat,
  contractReference: debts.contractReference,
  projectedMonthlyCorrectionRate: debts.projectedMonthlyCorrectionRate,
  expenseAccountId: debts.expenseAccountId,
  expenseCategoryId: debts.expenseCategoryId,
  expensePaymentMethod: debts.expensePaymentMethod,
  expenseFromInstallment: debts.expenseFromInstallment,
  createdAt: debts.createdAt,
  updatedAt: debts.updatedAt,
};

type DebtRow = Omit<DebtRecord, "statement" | "statementIssuedOn">;
type DebtColumnsRow = Omit<DebtRow, "expenses"> & {
  expenseAccountId: string | null;
  expenseCategoryId: string | null;
  expensePaymentMethod: string | null;
  expenseFromInstallment: number | null;
};

/** The four settings columns are set together (database check) or not at all. */
function toDebtRow({
  expenseAccountId,
  expenseCategoryId,
  expensePaymentMethod,
  expenseFromInstallment,
  ...row
}: DebtColumnsRow): DebtRow {
  const expenses =
    expenseAccountId && expenseCategoryId && expensePaymentMethod && expenseFromInstallment
      ? ({
          accountId: expenseAccountId,
          categoryId: expenseCategoryId,
          paymentMethod: expensePaymentMethod,
          fromInstallment: expenseFromInstallment,
        } as DebtExpenseSettings)
      : null;
  return { ...row, expenses };
}

const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const toDateString = (value: Date) => value.toISOString().slice(0, 10);

/** Expenses of a debt that were not paid yet; paid ones are history and are never changed. */
function pendingExpensesOf(debtId: string, userId: string) {
  return and(
    eq(transactions.debtId, debtId),
    eq(transactions.userId, userId),
    not(sql`coalesce(${transactions.isSettled}, false)`),
  );
}

function expenseSettingsColumns(settings: DebtExpenseSettings | null) {
  return {
    expenseAccountId: settings?.accountId ?? null,
    expenseCategoryId: settings?.categoryId ?? null,
    expensePaymentMethod: settings?.paymentMethod ?? null,
    expenseFromInstallment: settings?.fromInstallment ?? null,
  };
}

/** Attaches each debt's most recent statement (by issue date); debts without one are skipped. */
async function withLatestStatements(
  columnRows: DebtColumnsRow[],
  userId: string,
): Promise<DebtRecord[]> {
  if (columnRows.length === 0) return [];
  const rows = columnRows.map(toDebtRow);
  const latest = await db
    .selectDistinctOn([debtStatements.debtId], {
      debtId: debtStatements.debtId,
      issuedOn: debtStatements.issuedOn,
      statement: debtStatements.statement,
    })
    .from(debtStatements)
    .where(
      and(
        eq(debtStatements.userId, userId),
        inArray(
          debtStatements.debtId,
          rows.map((row) => row.id),
        ),
      ),
    )
    .orderBy(debtStatements.debtId, desc(debtStatements.issuedOn), desc(debtStatements.importedAt));
  const byDebt = new Map(latest.map((statement) => [statement.debtId, statement]));
  return rows.flatMap((row) => {
    const statement = byDebt.get(row.id);
    return statement
      ? [{ ...row, statementIssuedOn: statement.issuedOn, statement: statement.statement }]
      : [];
  });
}

async function findByIdForUser(id: string, userId: string) {
  const rows = await db
    .select(debtColumns)
    .from(debts)
    .where(and(eq(debts.id, id), eq(debts.userId, userId)))
    .limit(1);
  const [record] = await withLatestStatements(rows, userId);
  return record ?? null;
}

type SaveInstallmentExpensesInput = Parameters<DebtsRepository["saveInstallmentExpenses"]>[0];

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "23505") return true;
  return "cause" in error && isUniqueViolation(error.cause);
}

/** Settings, planned changes and the retarget of pending expenses, all in one transaction. */
function saveInstallmentExpensesInTransaction(data: SaveInstallmentExpensesInput) {
  return db.transaction(async (transaction) => {
    const pending = pendingExpensesOf(data.debtId, data.userId);
    await transaction
      .update(debts)
      .set({ ...expenseSettingsColumns(data.settings), updatedAt: new Date() })
      .where(and(eq(debts.id, data.debtId), eq(debts.userId, data.userId)));
    if (data.remove.length > 0) {
      await transaction
        .delete(transactions)
        .where(and(pending, inArray(transactions.id, data.remove)));
    }
    for (const expense of data.update) {
      await transaction
        .update(transactions)
        .set({
          amount: expense.amount,
          purchaseDate: toDate(expense.dueDate),
          dueDate: toDate(expense.dueDate),
          period: expense.period,
          updatedAt: new Date(),
        })
        .where(and(pending, eq(transactions.id, expense.id)));
    }
    if (data.create.length > 0) {
      await transaction.insert(transactions).values(
        data.create.map((expense) => ({
          userId: data.userId,
          personId: data.personId,
          type: "expense" as const,
          origin: "regular" as const,
          condition: "single" as const,
          paymentMethod: data.settings.paymentMethod,
          name: expense.name,
          amount: expense.amount,
          purchaseDate: toDate(expense.dueDate),
          period: expense.period,
          accountId: data.settings.accountId,
          categoryId: data.settings.categoryId,
          dueDate: toDate(expense.dueDate),
          isSettled: false,
          debtId: data.debtId,
          debtInstallmentNumber: expense.installmentNumber,
        })),
      );
    }
    await transaction
      .update(transactions)
      .set({
        accountId: data.settings.accountId,
        categoryId: data.settings.categoryId,
        paymentMethod: data.settings.paymentMethod,
        name: sql`${data.namePrefix} || ${transactions.debtInstallmentNumber}::text`,
      })
      .where(pending);
  });
}

export const debtsRepository = {
  async listByUser(userId) {
    const rows = await db
      .select(debtColumns)
      .from(debts)
      .where(eq(debts.userId, userId))
      .orderBy(asc(debts.createdAt));
    return withLatestStatements(rows, userId);
  },
  findByIdForUser,
  saveImport(data) {
    return db.transaction(async (transaction) => {
      const [debt] = await transaction
        .insert(debts)
        .values({
          userId: data.userId,
          name: data.defaultName,
          bank: data.bank,
          statementFormat: data.statementFormat,
          contractReference: data.contractReference,
        })
        .onConflictDoUpdate({
          target: [debts.userId, debts.bank, debts.contractReference],
          set: { statementFormat: data.statementFormat, updatedAt: new Date() },
        })
        .returning({ id: debts.id });
      if (!debt) throw new Error("Debt upsert returned no row");
      await transaction
        .insert(debtStatements)
        .values({
          userId: data.userId,
          debtId: debt.id,
          issuedOn: data.issuedOn,
          statement: data.statement,
        })
        .onConflictDoUpdate({
          target: [debtStatements.debtId, debtStatements.issuedOn],
          set: { statement: data.statement, importedAt: new Date() },
        });
      return { id: debt.id };
    });
  },
  async updateForUser(id, userId, data) {
    const [debt] = await db
      .update(debts)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(debts.id, id), eq(debts.userId, userId)))
      .returning({ id: debts.id });
    return debt ?? null;
  },
  deleteForUser(id, userId) {
    return db.transaction(async (transaction) => {
      await transaction.delete(transactions).where(pendingExpensesOf(id, userId));
      const [debt] = await transaction
        .delete(debts)
        .where(and(eq(debts.id, id), eq(debts.userId, userId)))
        .returning({ id: debts.id });
      return debt ?? null;
    });
  },
  async findExpenseTarget(userId, accountId, categoryId) {
    const [account] = await db
      .select({ archived: financialAccounts.isArchived })
      .from(financialAccounts)
      .where(and(eq(financialAccounts.id, accountId), eq(financialAccounts.userId, userId)))
      .limit(1);
    const [category] = await db
      .select({ type: categories.type })
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
      .limit(1);
    const [admin] = await db
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.userId, userId), eq(people.role, "admin")))
      .limit(1);
    if (!admin) throw new Error("User has no admin person");
    return { account: account ?? null, category: category ?? null, adminPersonId: admin.id };
  },
  async listInstallmentExpenses(debtId, userId) {
    const rows = await db
      .select({
        id: transactions.id,
        installmentNumber: transactions.debtInstallmentNumber,
        dueDate: transactions.dueDate,
        purchaseDate: transactions.purchaseDate,
        amount: transactions.amount,
        isSettled: transactions.isSettled,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.debtId, debtId),
          eq(transactions.userId, userId),
          isNotNull(transactions.debtInstallmentNumber),
        ),
      );
    return rows.map((row) => ({
      id: row.id,
      installmentNumber: row.installmentNumber ?? 0,
      dueDate: toDateString(row.dueDate ?? row.purchaseDate),
      amountCents: -Math.round(Number(row.amount) * 100),
      settled: row.isSettled === true,
    }));
  },
  async saveInstallmentExpenses(data) {
    try {
      await saveInstallmentExpensesInTransaction(data);
    } catch (error) {
      if (isUniqueViolation(error)) throw new DebtExpensesConflictError();
      throw error;
    }
  },
  disableInstallmentExpenses(debtId, userId) {
    return db.transaction(async (transaction) => {
      await transaction.delete(transactions).where(pendingExpensesOf(debtId, userId));
      await transaction
        .update(debts)
        .set({ ...expenseSettingsColumns(null), updatedAt: new Date() })
        .where(and(eq(debts.id, debtId), eq(debts.userId, userId)));
    });
  },
} satisfies DebtsRepository;
