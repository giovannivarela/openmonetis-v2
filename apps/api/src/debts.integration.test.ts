import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import type { DebtDetailOutput, DebtOutput } from "@openmonetis/validators/debts";
import { createTestApiClient } from "./test-support/api-client";
import { withIntegrationDatabase } from "./test-support/integration-database";

type ExpectedInstallment = {
  number: number;
  dueDate: string;
  status: string;
  amortizationCents: number;
  interestCents: number;
  installmentCents: number;
  balanceAfterCents: number;
};

const expected: ExpectedInstallment[] = JSON.parse(
  readFileSync(
    new URL(
      "../../../packages/domain/src/fixtures/debt-statement-itau-ddc-synthetic.json",
      import.meta.url,
    ),
    "utf8",
  ),
).expected.installments;

const statementPdf = readFileSync(
  new URL("./test-support/fixtures/debt-statement-itau-ddc-synthetic.pdf", import.meta.url),
).toString("base64");

const cents = (amount: number) => Math.round(amount * 100);

test("debts import a statement PDF, isolate users and rebuild the schedule from the stored statement", {
  skip: process.env.DEBTS_INTEGRATION_TEST !== "1",
}, async (t) => {
  await withIntegrationDatabase(async () => {
    const api = await createTestApiClient();
    const owner = await api.register();
    const stranger = await api.register();
    const { pool } = await import("@openmonetis/db");
    const statementCount = async () =>
      Number(
        (await pool.query<{ count: string }>("select count(*) from debt_statements")).rows[0]
          ?.count,
      );
    const importStatement = (contentBase64 = statementPdf) =>
      api.request("/debts/imports", owner, "POST", { fileName: "ddc.pdf", contentBase64 });

    await t.test("requires a session", async () => {
      await api.error(
        await api.request("/debts/imports", undefined, "POST", {
          fileName: "ddc.pdf",
          contentBase64: statementPdf,
        }),
        401,
      );
    });

    const debt = await api.data<DebtDetailOutput>(await importStatement(), 201);

    await t.test("reproduces every installment of the statement", async () => {
      assert.equal(debt.bank, "itau");
      assert.equal(debt.contractReferenceSuffix, "0000");
      assert.equal(debt.schedule.length, expected.length);
      assert.deepEqual(
        debt.schedule.map((row) => ({
          number: row.number,
          dueDate: row.dueDate,
          status: row.status,
          amortizationCents: cents(row.amortization),
          interestCents: cents(row.interest),
          installmentCents: cents(row.installment),
          balanceAfterCents: cents(row.balanceAfter),
        })),
        expected.map(
          ({
            number,
            dueDate,
            status,
            amortizationCents,
            interestCents,
            installmentCents,
            balanceAfterCents,
          }) => ({
            number,
            dueDate,
            status,
            amortizationCents,
            interestCents,
            installmentCents,
            balanceAfterCents,
          }),
        ),
      );
    });

    await t.test("re-importing the same statement keeps one debt and one statement", async () => {
      const again = await api.data<DebtDetailOutput>(await importStatement(), 201);
      assert.equal(again.id, debt.id);
      assert.equal((await api.data<DebtOutput[]>(await api.request("/debts", owner))).length, 1);
      assert.equal(await statementCount(), 1);
    });

    await t.test("rejects bytes that are not a PDF without saving", async () => {
      await api.error(
        await importStatement(Buffer.from("not a pdf").toString("base64")),
        400,
        "invalid_pdf",
      );
      assert.equal(await statementCount(), 1);
    });

    await t.test("another user cannot see, change or remove the debt", async () => {
      assert.deepEqual(await api.data<DebtOutput[]>(await api.request("/debts", stranger)), []);
      await api.error(await api.request(`/debts/${debt.id}`, stranger), 404, "debt_not_found");
      await api.error(
        await api.request(`/debts/${debt.id}`, stranger, "PATCH", { name: "Outro" }),
        404,
        "debt_not_found",
      );
      await api.error(
        await api.request(`/debts/${debt.id}`, stranger, "DELETE"),
        404,
        "debt_not_found",
      );
    });

    await t.test("the projection hypothesis changes projected installments only", async () => {
      await api.data(
        await api.request(`/debts/${debt.id}`, owner, "PATCH", {
          projectedMonthlyCorrectionRate: 0.002,
        }),
      );
      const updated = await api.data<DebtDetailOutput>(
        await api.request(`/debts/${debt.id}`, owner),
      );
      const known = (rows: DebtDetailOutput["schedule"]) =>
        rows.filter((row) => row.status !== "projected");
      assert.equal(updated.projectedMonthlyCorrectionRate, 0.002);
      assert.deepEqual(known(updated.schedule), known(debt.schedule));
      const firstProjected = debt.schedule.findIndex((row) => row.status === "projected");
      assert.notEqual(
        updated.schedule[firstProjected]?.interest,
        debt.schedule[firstProjected]?.interest,
      );
    });

    await t.test("a newer statement of the same contract takes over", async () => {
      const newer = await pool.query<{ issued_on: string }>(
        `insert into debt_statements (user_id, debt_id, issued_on, statement)
         select user_id, debt_id, issued_on + 30,
                jsonb_set(statement, '{issuedOn}', to_jsonb((issued_on + 30)::text))
         from debt_statements where debt_id = $1
         returning issued_on::text`,
        [debt.id],
      );
      const issuedOn = newer.rows[0]?.issued_on;
      assert.ok(issuedOn && issuedOn > debt.statementIssuedOn);
      const current = await api.data<DebtDetailOutput>(
        await api.request(`/debts/${debt.id}`, owner),
      );
      assert.equal(current.statementIssuedOn, issuedOn);
      const [listed] = await api.data<DebtOutput[]>(await api.request("/debts", owner));
      assert.equal(listed?.statementIssuedOn, issuedOn);
      assert.equal(await statementCount(), 2);
    });

    await t.test("installments launched as expenses", (subtest) => expenseScenario(subtest, api));

    await t.test("deleting the debt removes its statements", async () => {
      await api.data(await api.request(`/debts/${debt.id}`, owner, "DELETE"));
      await api.error(await api.request(`/debts/${debt.id}`, owner), 404, "debt_not_found");
      assert.equal(await statementCount(), 0);
    });
  });
});

type ApiClient = Awaited<ReturnType<typeof createTestApiClient>>;

/** Installments launched as expenses, for a person of its own on the shared test database. */
async function expenseScenario(t: TestContext, api: ApiClient) {
  const owner = await api.register();
  const stranger = await api.register();
  const { pool } = await import("@openmonetis/db");
  const account = await api.account(owner);
  const debt = await api.data<DebtDetailOutput>(
    await api.request("/debts/imports", owner, "POST", {
      fileName: "ddc.pdf",
      contentBase64: statementPdf,
    }),
    201,
  );
  type LaunchedRow = {
    id: string;
    number: number;
    amount: string;
    due_date: string;
    period: string;
    name: string;
    is_settled: boolean;
    debt_id: string | null;
  };
  const launched = async (where = "debt_id = $1", parameter: string = debt.id) =>
    (
      await pool.query<LaunchedRow>(
        `select id, debt_installment_number as number, amount::text, due_date::text, period,
                  name, is_settled, debt_id
             from transactions where ${where} order by debt_installment_number`,
        [parameter],
      )
    ).rows;
  const expensesPath = `/debts/${debt.id}/expenses`;
  const input = {
    accountId: account.id,
    categoryId: owner.expenseCategoryId,
    paymentMethod: "boleto",
  };

  await t.test("refuses another person's account and an income category", async () => {
    const foreign = await api.account(stranger);
    await api.error(
      await api.request(expensesPath, owner, "PUT", { ...input, accountId: foreign.id }),
      404,
      "account_not_found",
    );
    await api.error(
      await api.request(expensesPath, owner, "PUT", {
        ...input,
        categoryId: owner.incomeCategoryId,
      }),
      400,
      "category_not_expense",
    );
    await api.error(await api.request(expensesPath, stranger, "PUT", input), 404, "debt_not_found");
    assert.deepEqual(await launched(), []);
  });

  const enabled = await api.data<DebtDetailOutput>(
    await api.request(expensesPath, owner, "PUT", input),
  );
  const remaining = enabled.schedule.slice(enabled.summary.paidInstallments);

  await t.test("launches one pending expense per remaining installment", async () => {
    const rows = await launched();
    assert.ok(remaining.length > 0);
    assert.deepEqual(
      rows.map((row) => [row.number, row.amount, row.due_date, row.period, row.is_settled]),
      remaining.map((row) => [
        row.number,
        (-row.installment).toFixed(2),
        row.dueDate,
        row.dueDate.slice(0, 7),
        false,
      ]),
    );
    assert.equal(rows[0]?.name, `${debt.name} · parcela ${remaining[0]?.number}`);
    assert.deepEqual(enabled.expenseCounts, { pending: remaining.length, settled: 0 });
    assert.equal(enabled.expenses?.fromInstallment, remaining[0]?.number);
  });

  await t.test("launched installments are payables of their month", async () => {
    const first = remaining[0];
    const page = await api.data<unknown>(
      await api.request(`/transactions?period=${first?.dueDate.slice(0, 7)}&payables=true`, owner),
    );
    assert.match(JSON.stringify(page), new RegExp(`parcela ${first?.number}`));
  });

  await t.test("Compromissos futuros counts them as financing, not as single bills", async () => {
    const first = remaining[0];
    const period = first?.dueDate.slice(0, 7);
    const report = await api.data<{
      months: Array<{ period: string; debtsAmount: number; billsAmount: number }>;
    }>(await api.request(`/reports/commitments?startPeriod=${period}&endPeriod=${period}`, owner));
    assert.deepEqual(
      report.months.map((month) => [month.period, month.debtsAmount, month.billsAmount]),
      [[period, first?.installment, 0]],
    );
  });

  await t.test("a new projection updates pending expenses and leaves the paid one", async () => {
    const [paid, pending] = await launched();
    await api.data(
      await api.request("/transactions/settlement", owner, "PATCH", {
        ids: [paid?.id],
        isSettled: true,
      }),
    );
    await api.data(
      await api.request(`/debts/${debt.id}`, owner, "PATCH", {
        projectedMonthlyCorrectionRate: 0.002,
      }),
    );
    const after = await launched();
    assert.equal(after.find((row) => row.id === paid?.id)?.amount, paid?.amount);
    assert.notEqual(after.find((row) => row.id === pending?.id)?.amount, pending?.amount);
  });

  await t.test("stopping removes pending expenses and keeps the paid one", async () => {
    const detail = await api.data<DebtDetailOutput>(
      await api.request(expensesPath, owner, "DELETE"),
    );
    const rows = await launched();
    assert.equal(detail.expenses, null);
    assert.deepEqual(detail.expenseCounts, { pending: 0, settled: 1 });
    assert.deepEqual(
      rows.map((row) => row.is_settled),
      [true],
    );
  });

  await t.test("deleting the debt keeps the paid expense, unlinked", async () => {
    const [paid] = await launched();
    await api.data(await api.request(expensesPath, owner, "PUT", input));
    await api.data(await api.request(`/debts/${debt.id}`, owner, "DELETE"));
    assert.deepEqual(await launched(), []);
    const kept = await launched("id = $1", paid?.id);
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.debt_id, null);
  });
}
