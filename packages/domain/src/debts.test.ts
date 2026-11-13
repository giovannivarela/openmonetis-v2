import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildDebtSchedule,
  type DebtExtraAmortization,
  type DebtKnownInstallment,
  type DebtScheduleInput,
  type DebtScheduleRow,
  type DebtTerms,
  summarizeDebtSchedule,
} from "./debts";

type DebtFixture = {
  input: DebtScheduleInput;
  expected: Array<
    Pick<
      DebtScheduleRow,
      "number" | "dueDate" | "amortizationCents" | "interestCents" | "balanceAfterCents"
    > &
      Partial<DebtScheduleRow>
  >;
};

function readFixture(path: string | URL): DebtFixture {
  return JSON.parse(readFileSync(path, "utf8"));
}

function terms(overrides: Partial<DebtTerms> = {}): DebtTerms {
  return {
    principalCents: 120_000,
    contractDate: "2024-01-10",
    termMonths: 12,
    annualEffectiveRate: 0,
    amortizationSystem: "sac",
    ...overrides,
  };
}

function monthlyDueDates(
  count: number,
  firstMonth = 2,
  year = 2024,
  day = 10,
): DebtKnownInstallment[] {
  return Array.from({ length: count }, (_, index) => {
    const month = firstMonth + index;
    const date = new Date(Date.UTC(year, month - 1, day));
    return { dueDate: date.toISOString().slice(0, 10), correctionFactor: 1 };
  });
}

function schedule(overrides: Partial<DebtScheduleInput> = {}): DebtScheduleRow[] {
  return buildDebtSchedule({
    terms: terms(),
    knownInstallments: monthlyDueDates(2),
    extraAmortizations: [],
    chargeRules: [],
    projection: { monthlyCorrectionFactor: 1 },
    ...overrides,
  });
}

function extra(overrides: Partial<DebtExtraAmortization> = {}): DebtExtraAmortization {
  return {
    date: "2024-03-20",
    amountCents: 30_000,
    proRataInterestCents: 0,
    monetaryUpdateCents: 0,
    mode: "reduceTerm",
    ...overrides,
  };
}

test("SAC amortizes the corrected balance evenly and charges monthly interest on it", () => {
  const rows = schedule({ terms: terms({ annualEffectiveRate: 0.12 }) });

  assert.equal(rows.length, 12);
  assert.deepEqual(
    rows
      .slice(0, 2)
      .map((row) => [row.amortizationCents, row.interestCents, row.balanceAfterCents]),
    [
      [10_000, 1_139, 110_000],
      [10_000, 1_044, 100_000],
    ],
  );
  assert.equal(rows.at(-1)?.balanceAfterCents, 0);
  assert.equal(rows.at(-1)?.remainingTermMonths, 1);
});

test("applies the correction factor before interest and amortization", () => {
  const rows = schedule({
    terms: terms({ principalCents: 100_000, termMonths: 10 }),
    knownInstallments: [{ dueDate: "2024-02-10", correctionFactor: 1.01 }],
  });

  assert.equal(rows[0]?.correctedBalanceCents, 101_000);
  assert.equal(rows[0]?.amortizationCents, 10_100);
  assert.equal(rows[0]?.balanceAfterCents, 90_900);
});

test("charges pro-rata interest on a broken period and full interest on the next month", () => {
  const rows = schedule({
    terms: terms({ principalCents: 100_000, termMonths: 10, annualEffectiveRate: 0.12 }),
    knownInstallments: [
      { dueDate: "2024-01-20", correctionFactor: 1 },
      { dueDate: "2024-02-20", correctionFactor: 1 },
    ],
  });

  assert.deepEqual(
    rows.slice(0, 2).map((row) => row.interestCents),
    [315, 854],
  );
});

test("an extra amortization reducing the term keeps the installment and cuts months", () => {
  const rows = schedule({ extraAmortizations: [extra()] });

  assert.equal(rows.length, 9);
  assert.equal(rows[2]?.extraPrincipalCents, 30_000);
  assert.equal(rows[2]?.remainingTermMonths, 7);
  assert.equal(rows[2]?.amortizationCents, 10_000);
  assert.equal(rows.at(-1)?.balanceAfterCents, 0);
});

test("an extra amortization reducing the installment keeps the term", () => {
  const rows = schedule({ extraAmortizations: [extra({ mode: "reduceInstallment" })] });

  assert.equal(rows.length, 12);
  assert.equal(rows[2]?.remainingTermMonths, 10);
  assert.equal(rows[2]?.amortizationCents, 7_000);
});

test("only the principal of an extra amortization reduces the balance", () => {
  const rows = schedule({
    extraAmortizations: [
      extra({ proRataInterestCents: 500, monetaryUpdateCents: 200, mode: "reduceInstallment" }),
    ],
  });

  assert.equal(rows[2]?.extraPrincipalCents, 29_300);
  assert.equal(rows[2]?.correctedBalanceCents, 70_700);
});

test("an extra amortization dated on a due date applies after that installment", () => {
  const rows = schedule({ extraAmortizations: [extra({ date: "2024-03-10" })] });

  assert.equal(rows[1]?.extraPrincipalCents, 0);
  assert.equal(rows[2]?.extraPrincipalCents, 30_000);
});

test("computes charges from rules, honoring actual values and rule changes", () => {
  const rows = schedule({
    terms: terms({ principalCents: 100_000, termMonths: 4 }),
    knownInstallments: [
      { dueDate: "2024-02-10", correctionFactor: 1, charges: { mip: 999 } },
      { dueDate: "2024-03-10", correctionFactor: 1.01 },
      { dueDate: "2024-04-10", correctionFactor: 1 },
      { dueDate: "2024-05-10", correctionFactor: 1 },
    ],
    chargeRules: [
      { type: "balanceRate", code: "mip", effectiveFrom: "2024-01-10", rate: 0.001 },
      { type: "indexedAmount", code: "dfi", effectiveFrom: "2024-01-10", baseCents: 1_000 },
      { type: "fixedAmount", code: "fee", effectiveFrom: "2024-01-10", amountCents: 2_500 },
      { type: "balanceRate", code: "mip", effectiveFrom: "2024-04-10", rate: 0.0013 },
    ],
  });

  assert.deepEqual(
    rows.map((row) => row.charges),
    [
      [
        { code: "dfi", amountCents: 1_000 },
        { code: "fee", amountCents: 2_500 },
        { code: "mip", amountCents: 999 },
      ],
      [
        { code: "dfi", amountCents: 1_010 },
        { code: "fee", amountCents: 2_500 },
        { code: "mip", amountCents: 76 },
      ],
      [
        { code: "dfi", amountCents: 1_010 },
        { code: "fee", amountCents: 2_500 },
        { code: "mip", amountCents: 66 },
      ],
      [
        { code: "dfi", amountCents: 1_010 },
        { code: "fee", amountCents: 2_500 },
        { code: "mip", amountCents: 33 },
      ],
    ],
  );
  assert.equal(rows[1]?.installmentCents, 25_250 + 1_010 + 2_500 + 76);
});

test("an actual installment total from the statement takes precedence over the computed one", () => {
  const rows = schedule({
    knownInstallments: [{ dueDate: "2024-02-10", correctionFactor: 1, installmentCents: 9_999 }],
  });

  assert.equal(rows[0]?.installmentCents, 9_999);
  assert.equal(rows[1]?.installmentCents, 10_000);
});

test("projects monthly on the same day with the assumed correction until the balance is zero", () => {
  const rows = schedule({
    knownInstallments: monthlyDueDates(1),
    projection: { monthlyCorrectionFactor: 1.001 },
  });

  assert.equal(rows[0]?.status, "known");
  assert.equal(rows[1]?.status, "projected");
  assert.equal(rows[1]?.dueDate, "2024-03-10");
  assert.equal(rows[1]?.correctionFactor, 1.001);
  assert.equal(rows.length, 12);
  assert.equal(rows.at(-1)?.balanceAfterCents, 0);
});

test("summarizes paid and remaining totals and the months cut from the original term", () => {
  const debtTerms = terms();
  const rows = schedule({ terms: debtTerms, extraAmortizations: [extra()] });
  const summary = summarizeDebtSchedule(debtTerms, rows, "2024-04-10");

  assert.equal(summary.paidInstallments, 3);
  assert.equal(summary.remainingInstallments, 6);
  assert.equal(summary.monthsCut, 3);
  assert.equal(summary.currentBalanceCents, 60_000);
  assert.equal(summary.paid.amortizationCents, 30_000);
  assert.equal(summary.paid.extraPrincipalCents, 30_000);
  assert.equal(summary.remaining.amortizationCents, 60_000);
});

test("matches the independent reference engine on the synthetic fixture, row by row", () => {
  const fixture = readFixture(new URL("./fixtures/debts-sac-synthetic.json", import.meta.url));

  assert.deepEqual(buildDebtSchedule(fixture.input), fixture.expected);
});

const privateFixturePath = process.env.DEBTS_PRIVATE_FIXTURE;

test("reproduces a real bank statement to the cent (local only)", {
  skip: privateFixturePath ? false : "set DEBTS_PRIVATE_FIXTURE to a private statement fixture",
}, () => {
  const fixture = readFixture(privateFixturePath ?? "");
  const rows = buildDebtSchedule(fixture.input);

  assert.equal(rows.length, fixture.expected.length);
  assert.deepEqual(
    rows.map(({ number, dueDate, amortizationCents, interestCents, balanceAfterCents }) => ({
      number,
      dueDate,
      amortizationCents,
      interestCents,
      balanceAfterCents,
    })),
    fixture.expected,
  );
});
