import assert from "node:assert/strict";
import test from "node:test";
import {
  type DebtExpenseRecord,
  type DebtInstallmentForExpense,
  planDebtInstallmentExpenses,
} from "./debt-expenses";

function installment(number: number, installmentCents = 100_000): DebtInstallmentForExpense {
  return {
    number,
    dueDate: `2026-${String(number).padStart(2, "0")}-05`,
    installmentCents,
  };
}

function record(
  installmentNumber: number,
  overrides: Partial<DebtExpenseRecord> = {},
): DebtExpenseRecord {
  return {
    id: `tx-${installmentNumber}`,
    installmentNumber,
    dueDate: `2026-${String(installmentNumber).padStart(2, "0")}-05`,
    amountCents: 100_000,
    settled: false,
    ...overrides,
  };
}

const schedule = [1, 2, 3, 4, 5].map((number) => installment(number));

test("creates one expense per installment from the first one launched", () => {
  const plan = planDebtInstallmentExpenses({
    installments: schedule,
    existing: [],
    fromInstallment: 3,
  });

  assert.deepEqual(
    plan.create.map((item) => item.number),
    [3, 4, 5],
  );
  assert.deepEqual(plan.update, []);
  assert.deepEqual(plan.remove, []);
});

test("keeps expenses already in sync and updates pending ones whose amount or date moved", () => {
  const moved = schedule.map((item) =>
    item.number === 4 ? { ...item, installmentCents: 98_000 } : item,
  );
  const plan = planDebtInstallmentExpenses({
    installments: moved.map((item) =>
      item.number === 5 ? { ...item, dueDate: "2026-05-06" } : item,
    ),
    existing: [record(3), record(4), record(5)],
    fromInstallment: 3,
  });

  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.update, [
    { id: "tx-4", installment: installment(4, 98_000) },
    { id: "tx-5", installment: { ...installment(5), dueDate: "2026-05-06" } },
  ]);
  assert.deepEqual(plan.remove, []);
});

test("never touches an expense that was already paid", () => {
  const plan = planDebtInstallmentExpenses({
    installments: schedule.map((item) => ({ ...item, installmentCents: 90_000 })),
    existing: [record(3, { settled: true }), record(9, { settled: true })],
    fromInstallment: 3,
  });

  assert.deepEqual(
    plan.create.map((item) => item.number),
    [4, 5],
  );
  assert.deepEqual(plan.update, []);
  assert.deepEqual(plan.remove, []);
});

test("removes pending expenses whose installment left the schedule", () => {
  const plan = planDebtInstallmentExpenses({
    installments: schedule.slice(0, 3),
    existing: [record(3), record(4), record(5, { settled: true })],
    fromInstallment: 3,
  });

  assert.deepEqual(plan.remove, ["tx-4"]);
  assert.deepEqual(plan.create, []);
});

test("pending expenses created before still follow the schedule", () => {
  const plan = planDebtInstallmentExpenses({
    installments: schedule.map((item) =>
      item.number === 2 ? { ...item, installmentCents: 99_000 } : item,
    ),
    existing: [record(2), record(3), record(4), record(5)],
    fromInstallment: 3,
  });

  assert.deepEqual(plan.update, [{ id: "tx-2", installment: installment(2, 99_000) }]);
  assert.deepEqual(plan.create, []);
});
