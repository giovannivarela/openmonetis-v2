import assert from "node:assert/strict";
import test from "node:test";
import type { CategoryTrendRecurringRule } from "./category-trends";
import {
  calculateCommitments,
  countCommitmentMonths,
  resolveCommitmentStatus,
} from "./commitments";
import type { InstallmentReportRow } from "./installments";

const seriesId = "10000000-0000-4000-8000-000000000001";

function installmentRow(number: number, period: string, amount = 100): InstallmentReportRow {
  return {
    id: `row-${number}`,
    seriesId,
    name: "Notebook",
    note: null,
    amount,
    purchaseDate: `${period}-05`,
    period,
    dueDate: `${period}-10`,
    currentInstallment: number,
    paymentMethod: "pix",
    isSettled: false,
    invoicePaymentStatus: null,
    totalInstallments: 3,
    trackedFromInstallment: 1,
    originalAmount: 300,
    personId: "person",
    personName: "Admin",
    personAvatarUrl: null,
    categoryId: null,
    categoryName: null,
    categoryIcon: null,
    cardId: null,
    cardName: null,
    cardLogo: null,
    cardDueDay: null,
    accountId: null,
    accountName: null,
    accountLogo: null,
  };
}

function rule(type: "income" | "expense", amount: string): CategoryTrendRecurringRule {
  return {
    categoryId: "category",
    type,
    amount,
    anchorDate: "2026-10-01",
    startDate: "2026-10-01",
    frequency: "monthly",
    paymentMethod: "pix",
    dueDate: null,
    status: "active",
    card: null,
  };
}

const rows = [
  installmentRow(1, "2026-10"),
  installmentRow(2, "2026-11"),
  installmentRow(3, "2026-12"),
];

test("commitments sum installments, recurring rules and bills against expected income", () => {
  const report = calculateCommitments({
    period: "2026-10",
    months: 3,
    installmentRows: rows,
    recurringRules: [rule("expense", "200"), rule("income", "1000")],
    singleEntries: [{ period: "2026-11", type: "expense", origin: "regular", amount: "50.50" }],
  });

  assert.deepEqual(
    report.months.map((month) => [
      month.period,
      month.installmentsAmount,
      month.recurringAmount,
      month.billsAmount,
      month.committedAmount,
      month.incomeAmount,
      month.freeAmount,
      month.commitmentPercentage,
      month.status,
    ]),
    [
      ["2026-10", 100, 200, 0, 300, 1000, 700, 30, "healthy"],
      ["2026-11", 100, 200, 50.5, 350.5, 1000, 649.5, 35.1, "healthy"],
      ["2026-12", 100, 200, 0, 300, 1000, 700, 30, "healthy"],
    ],
  );
});

test("commitments report ending series and the first relevant relief", () => {
  const report = calculateCommitments({
    period: "2026-10",
    months: 4,
    installmentRows: rows,
    recurringRules: [rule("income", "500")],
    singleEntries: [],
  });

  assert.deepEqual(report.endingSeries, [
    { seriesId, name: "Notebook", endPeriod: "2026-12", monthlyAmount: 100, remainingAmount: 300 },
  ]);
  assert.deepEqual(report.relief, {
    period: "2027-01",
    previousPeriod: "2026-12",
    releasedAmount: 100,
    percentage: 100,
  });
});

test("commitments subtract refunds and invoice adjustments without counting them as income", () => {
  const report = calculateCommitments({
    period: "2026-10",
    months: 1,
    installmentRows: [installmentRow(1, "2026-10")],
    recurringRules: [rule("income", "1000")],
    singleEntries: [
      { period: "2026-10", type: "expense", origin: "regular", amount: "-80" },
      { period: "2026-10", type: "income", origin: "refund", amount: "30" },
      { period: "2026-10", type: "income", origin: "invoiceAdjustment", amount: "10" },
      { period: "2026-10", type: "income", origin: "regular", amount: "200" },
    ],
  });

  const [month] = report.months;
  assert.equal(month?.billsAmount, 80);
  assert.equal(month?.creditsAmount, 40);
  assert.equal(month?.committedAmount, 140);
  assert.equal(month?.incomeAmount, 1200);
  assert.equal(month?.freeAmount, 1060);
});

test("commitments relief ignores single bills that are not launched for future months yet", () => {
  const report = calculateCommitments({
    period: "2026-10",
    months: 3,
    installmentRows: rows,
    recurringRules: [rule("income", "1000")],
    singleEntries: [{ period: "2026-10", type: "expense", origin: "regular", amount: "500" }],
  });

  assert.equal(report.months[1]?.committedAmount, 100);
  assert.equal(report.relief, null);
});

test("commitments ignore paused rules and mark months without income as critical", () => {
  const report = calculateCommitments({
    period: "2026-10",
    months: 3,
    installmentRows: [installmentRow(1, "2026-10")],
    recurringRules: [{ ...rule("expense", "999"), status: "paused" }],
    singleEntries: [],
  });

  assert.equal(report.months[0]?.recurringAmount, 0);
  assert.equal(report.months[0]?.commitmentPercentage, null);
  assert.equal(report.months[0]?.status, "critical");
  assert.equal(report.months[1]?.status, "healthy");
});

test("commitment status uses the attention and critical thresholds", () => {
  assert.equal(resolveCommitmentStatus(59.9, 1), "healthy");
  assert.equal(resolveCommitmentStatus(60, 1), "attention");
  assert.equal(resolveCommitmentStatus(85, 1), "critical");
  assert.equal(resolveCommitmentStatus(null, 0), "healthy");
});

test("commitment month count is inclusive and handles year boundaries", () => {
  assert.equal(countCommitmentMonths("2026-10", "2026-10"), 1);
  assert.equal(countCommitmentMonths("2026-10", "2027-03"), 6);
  assert.equal(countCommitmentMonths("2026-10", "2026-09"), 0);
});

test("an installment launched by a debt counts as financing, not as a single bill", () => {
  const report = calculateCommitments({
    period: "2026-11",
    months: 1,
    installmentRows: [installmentRow(2, "2026-11")],
    recurringRules: [rule("income", "5000")],
    singleEntries: [
      { period: "2026-11", type: "expense", origin: "regular", amount: "-2000", debtId: "debt-1" },
      { period: "2026-11", type: "expense", origin: "regular", amount: "-50" },
    ],
  });

  const [month] = report.months;
  assert.equal(month?.debtsAmount, 2000);
  assert.equal(month?.billsAmount, 50);
  assert.equal(month?.committedAmount, 100 + 2000 + 50);
});

test("the end of a financing is a relief, unlike single bills not launched yet", () => {
  const installment = (period: string) => ({
    period,
    type: "expense" as const,
    origin: "regular" as const,
    amount: "-2000",
    debtId: "debt-1",
  });
  const report = calculateCommitments({
    period: "2026-10",
    months: 3,
    installmentRows: [],
    recurringRules: [rule("income", "5000")],
    singleEntries: [installment("2026-10"), installment("2026-11")],
  });

  assert.deepEqual(report.relief, {
    period: "2026-12",
    previousPeriod: "2026-11",
    releasedAmount: 2000,
    percentage: 100,
  });
});
