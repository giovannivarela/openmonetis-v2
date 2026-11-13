import { db, debtStatements, debts } from "@openmonetis/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { DebtRecord, DebtsRepository } from "../services/debts.service";

const debtColumns = {
  id: debts.id,
  userId: debts.userId,
  name: debts.name,
  bank: debts.bank,
  statementFormat: debts.statementFormat,
  contractReference: debts.contractReference,
  projectedMonthlyCorrectionRate: debts.projectedMonthlyCorrectionRate,
  createdAt: debts.createdAt,
  updatedAt: debts.updatedAt,
};

type DebtRow = Omit<DebtRecord, "statement" | "statementIssuedOn">;

/** Attaches each debt's most recent statement (by issue date); debts without one are skipped. */
async function withLatestStatements(rows: DebtRow[], userId: string): Promise<DebtRecord[]> {
  if (rows.length === 0) return [];
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
  async deleteForUser(id, userId) {
    const [debt] = await db
      .delete(debts)
      .where(and(eq(debts.id, id), eq(debts.userId, userId)))
      .returning({ id: debts.id });
    return debt ?? null;
  },
} satisfies DebtsRepository;
