import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ApiError } from "../utils/errors";
import { PdfTextError } from "../utils/pdf-text-lines";
import {
  createDebtsService,
  DebtExpensesConflictError,
  type DebtRecord,
  type DebtsRepository,
} from "./debts.service";

const owner = "00000000-0000-4000-8000-000000000001";
const stranger = "00000000-0000-4000-8000-000000000002";
const today = "2024-03-20";

const synthetic: { lines: string[]; expected: { installments: Array<{ interestCents: number }> } } =
  JSON.parse(
    readFileSync(
      new URL(
        "../../../../packages/domain/src/fixtures/debt-statement-itau-ddc-synthetic.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );

const pdfBase64 = Buffer.from("%PDF-1.4 synthetic").toString("base64");

type FakeExpense = {
  id: string;
  userId: string;
  debtId: string;
  installmentNumber: number;
  name: string;
  amount: string;
  dueDate: string;
  period: string;
  accountId: string;
  categoryId: string;
  paymentMethod: string;
  settled: boolean;
};

const accountId = "00000000-0000-4000-8000-0000000000a1";
const categoryId = "00000000-0000-4000-8000-0000000000c1";
const incomeCategoryId = "00000000-0000-4000-8000-0000000000c2";
const adminPersonId = "00000000-0000-4000-8000-0000000000p1";

function setup(lines: string[] | (() => never) = synthetic.lines, asOf = today) {
  const records = new Map<string, DebtRecord>();
  const expenses = new Map<string, FakeExpense>();
  const flags = { archivedAccount: false, conflictOnSave: false };
  let saves = 0;
  let expenseIds = 0;
  const repository: DebtsRepository = {
    async listByUser(userId) {
      return [...records.values()].filter((record) => record.userId === userId);
    },
    async findByIdForUser(id, userId) {
      const record = records.get(id);
      return record?.userId === userId ? record : null;
    },
    async saveImport(data) {
      saves += 1;
      const existing = [...records.values()].find(
        (record) =>
          record.userId === data.userId &&
          record.bank === data.bank &&
          record.contractReference === data.contractReference,
      );
      const id = existing?.id ?? `00000000-0000-4000-8000-00000000010${records.size}`;
      records.set(id, {
        id,
        userId: data.userId,
        name: existing?.name ?? data.defaultName,
        bank: data.bank,
        statementFormat: data.statementFormat,
        contractReference: data.contractReference,
        projectedMonthlyCorrectionRate: existing?.projectedMonthlyCorrectionRate ?? "0.000000",
        expenses: existing?.expenses ?? null,
        statementIssuedOn: data.issuedOn,
        statement: data.statement,
        createdAt: existing?.createdAt ?? new Date("2024-03-20T12:00:00Z"),
        updatedAt: new Date("2024-03-20T12:00:00Z"),
      });
      return { id };
    },
    async updateForUser(id, userId, data) {
      const record = records.get(id);
      if (!record || record.userId !== userId) return null;
      records.set(id, { ...record, ...data });
      return { id };
    },
    async deleteForUser(id, userId) {
      const record = records.get(id);
      if (!record || record.userId !== userId) return null;
      records.delete(id);
      for (const expense of [...expenses.values()])
        if (expense.debtId === id && !expense.settled) expenses.delete(expense.id);
      return { id };
    },
    async findExpenseTarget(userId, targetAccountId, targetCategoryId) {
      return {
        account:
          userId === owner && targetAccountId === accountId
            ? { archived: flags.archivedAccount }
            : null,
        category:
          userId !== owner
            ? null
            : targetCategoryId === categoryId
              ? { type: "expense" }
              : targetCategoryId === incomeCategoryId
                ? { type: "income" }
                : null,
        adminPersonId,
      };
    },
    async listInstallmentExpenses(debtId, userId) {
      return [...expenses.values()]
        .filter((expense) => expense.debtId === debtId && expense.userId === userId)
        .map((expense) => ({
          id: expense.id,
          installmentNumber: expense.installmentNumber,
          dueDate: expense.dueDate,
          amountCents: -Math.round(Number(expense.amount) * 100),
          settled: expense.settled,
        }));
    },
    async saveInstallmentExpenses(data) {
      if (flags.conflictOnSave) throw new DebtExpensesConflictError();
      const record = records.get(data.debtId);
      if (!record) throw new Error("missing debt");
      records.set(data.debtId, { ...record, expenses: data.settings });
      for (const id of data.remove) {
        if (!expenses.get(id)?.settled) expenses.delete(id);
      }
      for (const write of data.update) {
        const expense = expenses.get(write.id);
        if (expense && !expense.settled) Object.assign(expense, write);
      }
      for (const write of data.create) {
        expenseIds += 1;
        const id = `expense-${expenseIds}`;
        expenses.set(id, {
          id,
          userId: data.userId,
          debtId: data.debtId,
          settled: false,
          accountId: "",
          categoryId: "",
          paymentMethod: "",
          ...write,
        });
      }
      for (const expense of expenses.values()) {
        if (expense.debtId !== data.debtId || expense.settled) continue;
        expense.accountId = data.settings.accountId;
        expense.categoryId = data.settings.categoryId;
        expense.paymentMethod = data.settings.paymentMethod;
        expense.name = `${data.namePrefix}${expense.installmentNumber}`;
      }
    },
    async disableInstallmentExpenses(debtId, userId) {
      const record = records.get(debtId);
      if (!record || record.userId !== userId) return;
      records.set(debtId, { ...record, expenses: null });
      for (const expense of [...expenses.values()])
        if (expense.debtId === debtId && !expense.settled) expenses.delete(expense.id);
    },
  };
  const readPdfText = async () => (typeof lines === "function" ? lines() : lines);
  const service = createDebtsService(repository, readPdfText, () => asOf);
  return { service, saves: () => saves, expenses, flags };
}

async function rejectsWith(promise: Promise<unknown>, status: number, code: string) {
  await assert.rejects(
    promise,
    (error) => error instanceof ApiError && error.status === status && error.code === code,
  );
}

test("imports a statement and returns the summary and the full schedule", async () => {
  const { service } = setup();
  const debt = await service.importStatement(
    { fileName: "ddc.pdf", contentBase64: pdfBase64 },
    owner,
  );

  assert.equal(debt.name, "Financiamento Itaú •••0000");
  assert.equal(debt.bank, "itau");
  assert.equal(debt.statementIssuedOn, "2024-03-20");
  assert.equal(debt.schedule.length, 183);
  assert.equal(debt.schedule[0]?.status, "paid");
  assert.equal(debt.schedule[13]?.status, "open");
  assert.equal(debt.schedule[14]?.status, "projected");
  assert.equal(
    debt.schedule[0]?.interest,
    (synthetic.expected.installments[0]?.interestCents ?? 0) / 100,
  );
  assert.equal(debt.summary.paidInstallments, 14);
  assert.equal(debt.summary.remainingInstallments, 169);
  assert.equal(debt.summary.monthsCut, 240 - 183);
  assert.equal(debt.summary.lastDueDate, debt.schedule.at(-1)?.dueDate);
  assert.equal(debt.nextInstallment?.number, 15);
  assert.equal(debt.extraAmortizations.length, 6);
});

test("the current balance already reflects an extra made after the last due installment", async () => {
  const { service } = setup();
  const debt = await service.importStatement(
    { fileName: "ddc.pdf", contentBase64: pdfBase64 },
    owner,
  );
  const lastDue = debt.schedule[13];
  const extraPrincipal = debt.schedule[14]?.extraPrincipal ?? 0;

  assert.ok(extraPrincipal > 0);
  assert.equal(
    debt.summary.currentBalance,
    Math.round(((lastDue?.balanceAfter ?? 0) - extraPrincipal) * 100) / 100,
  );
  assert.equal(debt.summary.remaining.extraPrincipal, 0);
  assert.equal(debt.summary.currentBalance, debt.summary.remaining.amortization);
});

test("an installment due today is paid, so the next one is the following installment", async () => {
  const dueToday = "2024-03-05";
  const { service } = setup(synthetic.lines, dueToday);
  const debt = await service.importStatement(
    { fileName: "ddc.pdf", contentBase64: pdfBase64 },
    owner,
  );

  assert.equal(debt.schedule[13]?.dueDate, dueToday);
  assert.equal(debt.summary.paidInstallments, 14);
  assert.equal(debt.nextInstallment?.number, 15);
});

test("the detail carries yearly totals, each extra's principal and what already left the pocket", async () => {
  const { service } = setup();
  const debt = await service.importStatement(
    { fileName: "ddc.pdf", contentBase64: pdfBase64 },
    owner,
  );
  const cents = (amount: number) => Math.round(amount * 100);
  const yearly = (key: "amortization" | "interest" | "charges") =>
    debt.yearlyBreakdown.reduce((total, year) => total + cents(year[key]), 0);
  const { paid, remaining } = debt.summary;

  assert.equal(debt.yearlyBreakdown[0]?.year, 2023);
  assert.equal(debt.yearlyBreakdown[0]?.remainingOnly, false);
  assert.equal(debt.yearlyBreakdown.at(-1)?.remainingOnly, true);
  assert.equal(yearly("amortization"), cents(paid.amortization) + cents(remaining.amortization));
  assert.equal(yearly("interest"), cents(paid.interest) + cents(remaining.interest));
  assert.equal(yearly("charges"), cents(paid.charges) + cents(remaining.charges));
  for (const extra of debt.extraAmortizations) {
    assert.equal(
      cents(extra.principal),
      cents(extra.amount) - cents(extra.proRataInterest) - cents(extra.monetaryUpdate),
    );
  }
  const dueRows = debt.schedule.slice(0, debt.summary.paidInstallments);
  assert.equal(
    cents(debt.summary.paidOut),
    dueRows.reduce((total, row) => total + cents(row.installment), 0) +
      debt.extraAmortizations.reduce((total, extra) => total + cents(extra.amount), 0),
  );
});

test("re-importing the same contract keeps a single debt", async () => {
  const { service } = setup();
  const first = await service.importStatement(
    { fileName: "ddc.pdf", contentBase64: pdfBase64 },
    owner,
  );
  const second = await service.importStatement(
    { fileName: "ddc.pdf", contentBase64: pdfBase64 },
    owner,
  );

  assert.equal(second.id, first.id);
  assert.equal((await service.list(owner)).length, 1);
});

test("rejects bytes that are not a PDF without reading or saving", async () => {
  const { service, saves } = setup();

  await rejectsWith(
    service.importStatement(
      { fileName: "ddc.pdf", contentBase64: Buffer.from("hello").toString("base64") },
      owner,
    ),
    400,
    "invalid_pdf",
  );
  assert.equal(saves(), 0);
});

test("rejects a PDF the text extractor cannot open", async () => {
  const { service, saves } = setup(() => {
    throw new PdfTextError("INVALID_PDF");
  });

  await rejectsWith(
    service.importStatement({ fileName: "ddc.pdf", contentBase64: pdfBase64 }, owner),
    400,
    "invalid_pdf",
  );
  assert.equal(saves(), 0);
});

test("rejects a PDF that is not a supported statement", async () => {
  const { service, saves } = setup(["Extrato de conta corrente"]);

  await rejectsWith(
    service.importStatement({ fileName: "ddc.pdf", contentBase64: pdfBase64 }, owner),
    400,
    "unsupported_statement",
  );
  assert.equal(saves(), 0);
});

test("rejects a statement whose known installments the engine does not reproduce", async () => {
  const tampered = synthetic.lines.map((line) =>
    line.startsWith("5 05/06/2023 ") ? line.replace(/^(\S+ \S+ \S+) (\S+)/, "$1 1,00") : line,
  );
  const { service, saves } = setup(tampered);

  await rejectsWith(
    service.importStatement({ fileName: "ddc.pdf", contentBase64: pdfBase64 }, owner),
    400,
    "statement_not_reproduced",
  );
  assert.equal(saves(), 0);
});

test("the projection hypothesis changes projected installments only", async () => {
  const { service } = setup();
  const before = await service.importStatement(
    { fileName: "ddc.pdf", contentBase64: pdfBase64 },
    owner,
  );
  await service.update(before.id, owner, { projectedMonthlyCorrectionRate: 0.002 });
  const after = await service.get(before.id, owner);

  assert.equal(after.projectedMonthlyCorrectionRate, 0.002);
  assert.deepEqual(after.schedule.slice(0, 14), before.schedule.slice(0, 14));
  assert.notEqual(after.schedule[14]?.interest, before.schedule[14]?.interest);
});

test("another user cannot read, change or remove the debt", async () => {
  const { service } = setup();
  const debt = await service.importStatement(
    { fileName: "ddc.pdf", contentBase64: pdfBase64 },
    owner,
  );

  await rejectsWith(service.get(debt.id, stranger), 404, "debt_not_found");
  await rejectsWith(service.update(debt.id, stranger, { name: "Outro" }), 404, "debt_not_found");
  await rejectsWith(service.remove(debt.id, stranger), 404, "debt_not_found");
  assert.deepEqual(await service.list(stranger), []);
  assert.equal((await service.remove(debt.id, owner)).id, debt.id);
});

const expenseInput = { accountId, categoryId, paymentMethod: "boleto" as const };

async function importedDebt(asOf = today) {
  const context = setup(synthetic.lines, asOf);
  const debt = await context.service.importStatement(
    { fileName: "ddc.pdf", contentBase64: pdfBase64 },
    owner,
  );
  return { ...context, debt };
}

const sortedExpenses = (expenses: Map<string, FakeExpense>) =>
  [...expenses.values()].sort((left, right) => left.installmentNumber - right.installmentNumber);

test("launching installments creates one pending expense per installment from the next one", async () => {
  const { service, debt, expenses } = await importedDebt();
  const detail = await service.enableExpenses(debt.id, owner, expenseInput);
  const launched = sortedExpenses(expenses);
  const next = debt.schedule[14];

  assert.equal(launched.length, debt.schedule.length - 14);
  assert.equal(launched[0]?.installmentNumber, 15);
  assert.equal(launched[0]?.amount, (-(next?.installment ?? 0)).toFixed(2));
  assert.equal(launched[0]?.dueDate, next?.dueDate);
  assert.equal(launched[0]?.period, next?.dueDate.slice(0, 7));
  assert.equal(launched[0]?.name, `${debt.name} · parcela 15`);
  assert.equal(launched[0]?.accountId, accountId);
  assert.equal(launched[0]?.paymentMethod, "boleto");
  assert.deepEqual(detail.expenses, { ...expenseInput, fromInstallment: 15 });
  assert.deepEqual(detail.expenseCounts, { pending: launched.length, settled: 0 });
});

test("launching refuses accounts and categories the person cannot use", async () => {
  const { service, debt, expenses } = await importedDebt();

  await rejectsWith(
    service.enableExpenses(debt.id, owner, {
      ...expenseInput,
      accountId: "00000000-0000-4000-8000-0000000000a9",
    }),
    404,
    "account_not_found",
  );
  await rejectsWith(
    service.enableExpenses(debt.id, owner, { ...expenseInput, categoryId: incomeCategoryId }),
    400,
    "category_not_expense",
  );
  await rejectsWith(service.enableExpenses(debt.id, stranger, expenseInput), 404, "debt_not_found");
  assert.equal(expenses.size, 0);
});

test("a debt with no installment left to pay cannot launch expenses", async () => {
  const { service, debt } = await importedDebt("2099-01-01");

  await rejectsWith(service.enableExpenses(debt.id, owner, expenseInput), 400, "debt_paid_off");
});

test("a new projection updates pending expenses and leaves paid ones alone", async () => {
  const { service, debt, expenses } = await importedDebt();
  await service.enableExpenses(debt.id, owner, expenseInput);
  const [paid, pending] = sortedExpenses(expenses);
  if (!paid || !pending) throw new Error("expenses were not launched");
  paid.settled = true;
  const paidAmount = paid.amount;
  const pendingAmount = pending.amount;

  await service.update(debt.id, owner, { projectedMonthlyCorrectionRate: 0.002 });

  assert.equal(paid.amount, paidAmount);
  assert.notEqual(pending.amount, pendingAmount);
});

test("renaming the debt renames its pending expenses", async () => {
  const { service, debt, expenses } = await importedDebt();
  await service.enableExpenses(debt.id, owner, expenseInput);

  await service.update(debt.id, owner, { name: "Apartamento" });

  const launched = sortedExpenses(expenses);
  assert.ok(launched.length > 0);
  assert.ok(launched.every((expense) => expense.name.startsWith("Apartamento · parcela ")));
});

test("stopping removes pending expenses and keeps the paid ones", async () => {
  const { service, debt, expenses } = await importedDebt();
  await service.enableExpenses(debt.id, owner, expenseInput);
  const [paid] = sortedExpenses(expenses);
  if (!paid) throw new Error("expenses were not launched");
  paid.settled = true;

  const detail = await service.disableExpenses(debt.id, owner);

  assert.equal(detail.expenses, null);
  assert.deepEqual([...expenses.keys()], [paid.id]);
  assert.deepEqual(detail.expenseCounts, { pending: 0, settled: 1 });
});

test("a concurrent launch is reported as a conflict, not as a server error", async () => {
  const { service, debt, flags } = await importedDebt();
  flags.conflictOnSave = true;

  await rejectsWith(
    service.enableExpenses(debt.id, owner, expenseInput),
    409,
    "debt_expenses_conflict",
  );
});

test("an archived account pauses the sync until another account is chosen", async () => {
  const { service, debt, expenses, flags } = await importedDebt();
  await service.enableExpenses(debt.id, owner, expenseInput);
  const [first] = sortedExpenses(expenses);
  const amountBefore = first?.amount;
  flags.archivedAccount = true;

  await service.update(debt.id, owner, { projectedMonthlyCorrectionRate: 0.002 });

  assert.equal(sortedExpenses(expenses)[0]?.amount, amountBefore);
  await rejectsWith(service.enableExpenses(debt.id, owner, expenseInput), 404, "account_not_found");
});
