import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readDebtStatement } from "./debt-statement-readers";
import {
  type DebtStatement,
  DebtStatementError,
  type DebtStatementInstallment,
  scheduleInputFromStatement,
} from "./debt-statements";
import { buildDebtSchedule, type DebtScheduleRow, type DebtTerms } from "./debts";

type StatementFixture = {
  lines: string[];
  expected: {
    terms?: DebtTerms;
    installments: DebtStatementInstallment[];
    extraAmortizations?: DebtStatement["extraAmortizations"];
  };
};

function readFixture(path: string | URL): StatementFixture {
  return JSON.parse(readFileSync(path, "utf8"));
}

const synthetic = readFixture(
  new URL("./fixtures/debt-statement-itau-ddc-synthetic.json", import.meta.url),
);

function asStatementRow(row: DebtScheduleRow): DebtStatementInstallment {
  return {
    number: row.number,
    dueDate: row.dueDate,
    status: "projected",
    amortizationCents: row.amortizationCents,
    interestCents: row.interestCents,
    charges: Object.fromEntries(
      row.charges
        .filter((charge) => charge.amountCents !== 0)
        .map((charge) => [charge.code, charge.amountCents]),
    ),
    installmentCents: row.installmentCents,
    balanceAfterCents: row.balanceAfterCents,
  };
}

function withoutStatus(installments: DebtStatementInstallment[]) {
  return installments.map(({ status: _status, ...rest }) => rest);
}

function reproduce(statement: DebtStatement) {
  return buildDebtSchedule(
    scheduleInputFromStatement(statement, { monthlyCorrectionFactor: 1 }),
  ).map(asStatementRow);
}

function replaceLine(lines: string[], startsWith: string, replacement: string) {
  return lines.map((line) => (line.startsWith(startsWith) ? replacement : line));
}

test("reads an Itaú DDC into the canonical statement", () => {
  const statement = readDebtStatement(synthetic.lines);

  assert.equal(statement.bank, "itau");
  assert.equal(statement.format, "ddc");
  assert.equal(statement.issuedOn, "2024-03-20");
  assert.equal(statement.contractReference, "0000000000");
  assert.deepEqual(statement.terms, synthetic.expected.terms);
  assert.deepEqual(statement.installments, synthetic.expected.installments);
  assert.deepEqual(statement.extraAmortizations, synthetic.expected.extraAmortizations);
});

test("reproduces every row of the statement, projected rows and charges included", () => {
  const statement = readDebtStatement(synthetic.lines);

  assert.deepEqual(withoutStatus(reproduce(statement)), withoutStatus(statement.installments));
});

test("derives charge rules that reproduce projected charges, band changes and a final zero included", () => {
  const terms: DebtTerms = {
    principalCents: 600_000,
    contractDate: "2024-01-10",
    termMonths: 6,
    annualEffectiveRate: 0,
    amortizationSystem: "sac",
  };
  const row = (
    number: number,
    status: DebtStatementInstallment["status"],
    charges: Record<string, number>,
  ): DebtStatementInstallment => {
    const amortizationCents = 100_000;
    const balanceAfterCents = 600_000 - number * amortizationCents;
    const chargesCents = Object.values(charges).reduce((sum, value) => sum + value, 0);
    return {
      number,
      dueDate: `2024-0${number + 1}-10`,
      status,
      amortizationCents,
      interestCents: 0,
      charges,
      installmentCents: amortizationCents + chargesCents,
      balanceAfterCents,
    };
  };
  const statement: DebtStatement = {
    bank: "itau",
    format: "ddc",
    issuedOn: "2024-03-01",
    contractReference: "0000000000",
    terms,
    installments: [
      row(1, "paid", { mip: 111, fee: 2_500 }),
      row(2, "open", { mip: 99, dfi: 1_234, fee: 2_500 }),
      row(3, "projected", { mip: 47, dfi: 1_234, fee: 2_500 }),
      row(4, "projected", { mip: 35, dfi: 1_234, fee: 2_500 }),
      row(5, "projected", { mip: 41, dfi: 1_234, fee: 2_500 }),
      row(6, "projected", { fee: 2_500 }),
    ],
    extraAmortizations: [],
    chargeKinds: { mip: "balanceRate", dfi: "indexedAmount", fee: "fixedAmount" },
  };

  assert.deepEqual(withoutStatus(reproduce(statement)), withoutStatus(statement.installments));
});

test("rejects text that is not a supported statement", () => {
  assert.throws(
    () => readDebtStatement(["Extrato de conta corrente", "Saldo 10,00"]),
    (error) => error instanceof DebtStatementError && error.code === "UNSUPPORTED_STATEMENT",
  );
});

test("rejects an unreadable table row instead of guessing its numbers", () => {
  const lines = replaceLine(
    synthetic.lines,
    "3 05/04/2023 ",
    "3 05/04/2023 773,59 1.536,91 1,0023 18,04 Paga",
  );

  assert.throws(
    () => readDebtStatement(lines),
    (error) => error instanceof DebtStatementError && error.code === "UNREADABLE_LINE",
  );
});

test("rejects an unknown operation, which could change the balance", () => {
  const lines = [...synthetic.lines];
  lines.splice(
    20,
    0,
    "Operação: Portabilidade de credito Data: 10/03/2023 Valor da Operação: 1.000,00",
  );

  assert.throws(
    () => readDebtStatement(lines),
    (error) => error instanceof DebtStatementError && error.code === "UNSUPPORTED_OPERATION",
  );
});

test("rejects an amortization system the engine does not support", () => {
  const lines = replaceLine(
    synthetic.lines,
    "Sistema de amortização",
    "Sistema de amortização PRICE",
  );

  assert.throws(
    () => readDebtStatement(lines),
    (error) =>
      error instanceof DebtStatementError && error.code === "UNSUPPORTED_AMORTIZATION_SYSTEM",
  );
});

test("rejects a statement without the contract start operation", () => {
  const lines = synthetic.lines.filter(
    (line) => !line.startsWith("Operação: Implantacao de contrato"),
  );

  assert.throws(
    () => readDebtStatement(lines),
    (error) => error instanceof DebtStatementError && error.code === "MISSING_FIELD",
  );
});

const privateStatementPath = process.env.DEBTS_PRIVATE_STATEMENT;

test("reads and reproduces a real statement to the cent (local only)", {
  skip: privateStatementPath ? false : "set DEBTS_PRIVATE_STATEMENT to a private statement fixture",
}, () => {
  const fixture = readFixture(privateStatementPath ?? "");
  const statement = readDebtStatement(fixture.lines);

  assert.deepEqual(statement.installments, fixture.expected.installments);
  assert.deepEqual(
    withoutStatus(reproduce(statement)),
    withoutStatus(fixture.expected.installments),
  );
});
