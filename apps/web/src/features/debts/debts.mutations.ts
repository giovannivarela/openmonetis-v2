import type { UpdateDebtInput } from "@openmonetis/validators/debts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteDebt, importDebtStatement, updateDebt } from "./debts.api";
import { debtKeys } from "./debts.queries";

export function useImportDebtStatementMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: importDebtStatement,
    onSuccess: (debt) => {
      queryClient.setQueryData(debtKeys.detail(debt.id), debt);
      return queryClient.invalidateQueries({ queryKey: debtKeys.list() });
    },
  });
}

export function useUpdateDebtMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDebtInput }) => updateDebt(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: debtKeys.all }),
  });
}

export function useDeleteDebtMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteDebt,
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: debtKeys.detail(id) });
      return queryClient.invalidateQueries({ queryKey: debtKeys.list() });
    },
  });
}
