import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { extractPdfTextLines, PdfTextError } from "./pdf-text-lines";

test("extracts text lines in reading order, page by page", async () => {
  const pdf = readFileSync(new URL("./fixtures/pdf-text-lines.pdf", import.meta.url));

  assert.deepEqual(await extractPdfTextLines(pdf), [
    "Parcela Saldo",
    "1 10/01/2024 100,00 Paga",
    "Observacoes:",
  ]);
});

test("rejects bytes that are not a PDF", async () => {
  await assert.rejects(
    extractPdfTextLines(Buffer.from("not a pdf")),
    (error) => error instanceof PdfTextError && error.code === "INVALID_PDF",
  );
});
