import assert from "node:assert/strict";
import test from "node:test";
import type { DebtScheduleRowOutput } from "@openmonetis/validators/debts";
import {
  buildDebtBalanceSeries,
  debtBalanceYearTicks,
  debtBankInitials,
  debtBankLabel,
  debtExpensePaymentMethodOptions,
  debtExpensesErrorMessage,
  debtExtraModeLabel,
  debtExtraSourceLabel,
  debtImportErrorMessage,
  debtInstallmentStatusLabel,
  formatDebtCorrectionRate,
  formatDebtDate,
  formatDebtExpenseCounts,
  formatDebtMonth,
  getDebtAmortizedShare,
  getUpcomingDebtInstallments,
  parseDebtCorrectionRate,
  validateDebtStatementFile,
} from "./debts.presentation";

function row(
  number: number,
  overrides: Partial<DebtScheduleRowOutput> = {},
): DebtScheduleRowOutput {
  return {
    number,
    dueDate: `2024-${String(number + 1).padStart(2, "0")}-05`,
    status: "projected",
    amortization: 100,
    interest: 10,
    charges: [{ code: "fee", amount: 25 }],
    installment: 135,
    balanceAfter: 1_000 - number * 100,
    extraPrincipal: 0,
    remainingTermMonths: 10 - number,
    ...overrides,
  };
}

const terms = { principal: 1_000, contractDate: "2024-01-20" };

test("the balance chart starts at the contract, hands over to the projection after today and carries each installment", () => {
  const schedule = [row(1, { status: "paid" }), row(2, { extraPrincipal: 50 }), row(3)];

  assert.deepEqual(buildDebtBalanceSeries(terms, schedule, 1), [
    {
      date: "2024-01-20",
      number: null,
      balance: 1_000,
      installment: null,
      extraPrincipal: 0,
      recorded: 1_000,
      projected: null,
      extra: null,
    },
    {
      date: "2024-02-05",
      number: 1,
      balance: 900,
      installment: 135,
      extraPrincipal: 0,
      recorded: 900,
      projected: 900,
      extra: null,
    },
    {
      date: "2024-03-05",
      number: 2,
      balance: 800,
      installment: 135,
      extraPrincipal: 50,
      recorded: null,
      projected: 800,
      extra: 800,
    },
    {
      date: "2024-04-05",
      number: 3,
      balance: 700,
      installment: 135,
      extraPrincipal: 0,
      recorded: null,
      projected: 700,
      extra: null,
    },
  ]);
});

test("before the first installment the projection starts at the contract", () => {
  const [contract, first] = buildDebtBalanceSeries(terms, [row(1), row(2)], 0);

  assert.equal(contract?.recorded, 1_000);
  assert.equal(contract?.projected, 1_000);
  assert.equal(first?.recorded, null);
});

test("the balance chart axis marks one January every few years", () => {
  const dates = [
    "2023-01-20",
    "2023-02-05",
    "2024-01-05",
    "2025-01-05",
    "2026-01-05",
    "2027-01-05",
  ];
  const series = dates.map((date) => ({
    date,
    number: 1,
    balance: 1,
    installment: 1,
    extraPrincipal: 0,
    recorded: 1,
    projected: null,
    extra: null,
  }));

  assert.deepEqual(debtBalanceYearTicks(series, 2), ["2024-01-05", "2026-01-05"]);
  assert.deepEqual(debtBalanceYearTicks(series, 1), [
    "2024-01-05",
    "2025-01-05",
    "2026-01-05",
    "2027-01-05",
  ]);
});

test("upcoming installments are the ones after the installments already due", () => {
  const schedule = [row(1), row(2), row(3), row(4)];

  assert.deepEqual(
    getUpcomingDebtInstallments(schedule, 1, 2).map((installment) => installment.number),
    [2, 3],
  );
  assert.deepEqual(getUpcomingDebtInstallments(schedule, 4, 6), []);
});

test("import errors become short Portuguese messages, never the API code", () => {
  const generic = debtImportErrorMessage(undefined);
  const known = [
    "invalid_pdf",
    "unsupported_statement",
    "statement_not_reproduced",
    "rate_limited",
  ].map(debtImportErrorMessage);

  for (const message of [...known, generic, debtImportErrorMessage("unreadable_line")]) {
    assert.ok(message.length > 0 && message.length <= 120, message);
    assert.doesNotMatch(message, /_/);
  }
  assert.equal(new Set(known).size, known.length);
  assert.ok(!known.includes(generic));
  assert.equal(debtImportErrorMessage("something_new"), generic);
  assert.equal(
    debtImportErrorMessage("unsupported_operation"),
    debtImportErrorMessage("missing_field"),
  );
});

test("only a non-empty PDF up to 5 MB can be imported", () => {
  const megabyte = 1024 * 1024;

  assert.equal(
    validateDebtStatementFile({ name: "ddc.pdf", type: "application/pdf", size: 10 }),
    null,
  );
  assert.equal(validateDebtStatementFile({ name: "DDC.PDF", type: "", size: 10 }), null);
  assert.match(
    validateDebtStatementFile({ name: "ddc.png", type: "image/png", size: 10 }) ?? "",
    /PDF/,
  );
  assert.match(
    validateDebtStatementFile({
      name: "ddc.pdf",
      type: "application/pdf",
      size: 5 * megabyte + 1,
    }) ?? "",
    /5 MB/,
  );
  assert.ok(validateDebtStatementFile({ name: "ddc.pdf", type: "application/pdf", size: 0 }));
});

test("the projected correction is typed as a monthly percentage", () => {
  assert.equal(parseDebtCorrectionRate("0,25"), 0.0025);
  assert.equal(parseDebtCorrectionRate(" 0.1 "), 0.001);
  assert.equal(parseDebtCorrectionRate("0"), 0);
  assert.equal(parseDebtCorrectionRate(""), null);
  assert.equal(parseDebtCorrectionRate("abc"), null);
  assert.equal(parseDebtCorrectionRate("-1"), null);
  assert.equal(parseDebtCorrectionRate("5,01"), null);
  assert.equal(formatDebtCorrectionRate(0.0025), "0,25");
  assert.equal(formatDebtCorrectionRate(0), "0,00");
});

test("share already paid off of the financed amount stays between 0 and 1", () => {
  assert.equal(getDebtAmortizedShare({ principal: 200, currentBalance: 150 }), 0.25);
  assert.equal(getDebtAmortizedShare({ principal: 200, currentBalance: 230 }), 0);
  assert.equal(getDebtAmortizedShare({ principal: 200, currentBalance: 0 }), 1);
});

test("labels", () => {
  assert.equal(formatDebtMonth("2038-04-05"), "Abr 2038");
  assert.equal(formatDebtDate("2024-04-05"), "05/04/2024");
  assert.equal(debtBankLabel("itau"), "Itaú");
  assert.equal(debtBankInitials("itau"), "IT");
  assert.equal(debtInstallmentStatusLabel("paid"), "Paga");
  assert.equal(debtInstallmentStatusLabel("open"), "Em aberto");
  assert.equal(debtInstallmentStatusLabel("projected"), "Projetada");
  assert.equal(debtExtraModeLabel("reduceTerm"), "Reduz prazo");
  assert.equal(debtExtraModeLabel("reduceInstallment"), "Reduz parcela");
  assert.equal(debtExtraSourceLabel("fgts"), "FGTS");
  assert.equal(debtExtraSourceLabel("ownFunds"), "Recursos próprios");
});

test("installments can be launched with the account payment methods, never a credit card", () => {
  assert.deepEqual(debtExpensePaymentMethodOptions, [
    { value: "boleto", label: "Boleto" },
    { value: "debit_card", label: "Cartão de débito" },
    { value: "pix", label: "Pix" },
    { value: "bank_transfer", label: "Transferência bancária" },
  ]);
});

test("launched installments are counted in words", () => {
  assert.equal(
    formatDebtExpenseCounts({ pending: 137, settled: 1 }),
    "137 parcelas pendentes · 1 paga",
  );
  assert.equal(formatDebtExpenseCounts({ pending: 1, settled: 0 }), "1 parcela pendente");
  assert.equal(formatDebtExpenseCounts({ pending: 0, settled: 3 }), "3 pagas");
  assert.equal(formatDebtExpenseCounts({ pending: 0, settled: 0 }), "Nenhuma parcela lançada");
});

test("launch errors become short Portuguese messages", () => {
  const generic = debtExpensesErrorMessage(undefined);
  assert.notEqual(debtExpensesErrorMessage("account_not_found"), generic);
  assert.equal(
    debtExpensesErrorMessage("category_not_found"),
    debtExpensesErrorMessage("category_not_expense"),
  );
  assert.notEqual(debtExpensesErrorMessage("debt_paid_off"), generic);
  assert.notEqual(debtExpensesErrorMessage("debt_expenses_conflict"), generic);
  assert.notEqual(debtExpensesErrorMessage("rate_limited"), generic);
  assert.equal(debtExpensesErrorMessage("anything_else"), generic);
  for (const code of ["account_not_found", "category_not_expense", "debt_paid_off", undefined])
    assert.doesNotMatch(debtExpensesErrorMessage(code), /_/);
});
