import { queryOptions } from "@tanstack/react-query";
import { getDebt, getDebts } from "./debts.api";

export const debtKeys = {
  all: ["debts"] as const,
  list: () => ["debts", "list"] as const,
  detail: (id: string) => ["debts", "detail", id] as const,
};

export function debtsQueryOptions() {
  return queryOptions({ queryKey: debtKeys.list(), queryFn: getDebts });
}

export function debtQueryOptions(id: string) {
  return queryOptions({
    queryKey: debtKeys.detail(id),
    queryFn: () => getDebt(id),
  });
}
