import type {
  DebtDetailOutput,
  DebtExpensesInput,
  UpdateDebtInput,
} from "@openmonetis/validators/debts";
import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { refreshFinancialQueries } from "@/lib/financial-query-invalidation";
import {
  deleteDebt,
  disableDebtExpenses,
  enableDebtExpenses,
  importDebtStatement,
  updateDebt,
} from "./debts.api";
import { debtKeys } from "./debts.queries";

/**
 * Debts can launch their installments as expenses, so any change to a debt may change
 * transactions, payables and reports too: refresh every financial query, debts included.
 */
function refreshWithDetail(queryClient: QueryClient, debt: DebtDetailOutput) {
  queryClient.setQueryData(debtKeys.detail(debt.id), debt);
  return refreshFinancialQueries(queryClient);
}

export function useImportDebtStatementMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: importDebtStatement,
    onSuccess: (debt) => refreshWithDetail(queryClient, debt),
  });
}

export function useUpdateDebtMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDebtInput }) => updateDebt(id, input),
    onSuccess: () => refreshFinancialQueries(queryClient),
  });
}

export function useEnableDebtExpensesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DebtExpensesInput }) =>
      enableDebtExpenses(id, input),
    onSuccess: (debt) => refreshWithDetail(queryClient, debt),
  });
}

export function useDisableDebtExpensesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: disableDebtExpenses,
    onSuccess: (debt) => refreshWithDetail(queryClient, debt),
  });
}

export function useDeleteDebtMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteDebt,
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: debtKeys.detail(id) });
      return refreshFinancialQueries(queryClient);
    },
  });
}
