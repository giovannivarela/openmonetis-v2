import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ApiError } from "../utils/errors";
import { PdfTextError } from "../utils/pdf-text-lines";
import { createDebtsService, type DebtRecord, type DebtsRepository } from "./debts.service";

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

function setup(lines: string[] | (() => never) = synthetic.lines, asOf = today) {
  const records = new Map<string, DebtRecord>();
  let saves = 0;
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
      return { id };
    },
  };
  const readPdfText = async () => (typeof lines === "function" ? lines() : lines);
  const service = createDebtsService(repository, readPdfText, () => asOf);
  return { service, saves: () => saves };
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
