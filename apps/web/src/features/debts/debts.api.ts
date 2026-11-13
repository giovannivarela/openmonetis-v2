import type {
  DebtDetailOutput,
  DebtExpensesInput,
  DebtOutput,
  UpdateDebtInput,
} from "@openmonetis/validators/debts";
import { requestApi as request } from "@/lib/api-client";

export function getDebts() {
  return request<DebtOutput[]>("/debts");
}

export function getDebt(id: string) {
  return request<DebtDetailOutput>(`/debts/${id}`);
}

/** Sends the statement PDF; the API reads it in memory and keeps only the extracted statement. */
export async function importDebtStatement(file: File) {
  const contentBase64 = await readFileAsBase64(file);
  return request<DebtDetailOutput>("/debts/imports", {
    method: "POST",
    body: JSON.stringify({ fileName: file.name, contentBase64 }),
  });
}

export function updateDebt(id: string, input: UpdateDebtInput) {
  return request<DebtOutput>(`/debts/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function enableDebtExpenses(id: string, input: DebtExpensesInput) {
  return request<DebtDetailOutput>(`/debts/${id}/expenses`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function disableDebtExpenses(id: string) {
  return request<DebtDetailOutput>(`/debts/${id}/expenses`, { method: "DELETE" });
}

export function deleteDebt(id: string) {
  return request<{ id: string }>(`/debts/${id}`, { method: "DELETE" });
}

// Intentional mirror of the private reader in transactions.api.ts; each import has its own errors.
function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("DEBT_STATEMENT_UNREADABLE"));
    reader.onload = () => {
      const content = String(reader.result ?? "").split(",", 2)[1];
      if (!content) reject(new Error("DEBT_STATEMENT_UNREADABLE"));
      else resolve(content);
    };
    reader.readAsDataURL(file);
  });
}
