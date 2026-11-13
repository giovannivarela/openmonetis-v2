import type { AccountOutput } from "@openmonetis/validators/accounts";
import type { CategoryOutput } from "@openmonetis/validators/categories";
import {
  type DebtDetailOutput,
  type DebtExpensesInput,
  DebtExpensesInputSchema,
} from "@openmonetis/validators/debts";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { MobileSelect as Select } from "@/components/forms/mobile-select";
import { MobileSelectContent as SelectContent } from "@/components/forms/mobile-select-content";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { accountsQueryOptions } from "@/features/accounts/accounts.queries";
import { categoriesQueryOptions } from "@/features/categories/categories.queries";
import { ApiClientError } from "@/lib/api-client";
import { useDisableDebtExpensesMutation, useEnableDebtExpensesMutation } from "../debts.mutations";
import {
  debtExpensePaymentMethodLabel,
  debtExpensePaymentMethodOptions,
  debtExpensesErrorMessage,
  formatDebtExpenseCounts,
} from "../debts.presentation";

/** Launches the installments still to come as pending expenses of an account. */
export function DebtExpensesCard({ debt }: { debt: DebtDetailOutput }) {
  const accountsQuery = useQuery(accountsQueryOptions());
  const categoriesQuery = useQuery(categoriesQueryOptions());
  const disableMutation = useDisableDebtExpensesMutation();
  const [editing, setEditing] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const accounts = (accountsQuery.data ?? []).filter((account) => !account.isArchived);
  const categories = (categoriesQuery.data ?? []).filter(
    (category) => category.type === "expense" && !category.isSystem,
  );
  const settings = debt.expenses;
  const accountName = accountsQuery.data?.find((item) => item.id === settings?.accountId)?.name;
  const categoryName = categoriesQuery.data?.find((item) => item.id === settings?.categoryId)?.name;

  async function stop() {
    try {
      await disableMutation.mutateAsync(debt.id);
      setStopOpen(false);
      toast.success("Parcelas removidas de Lançamentos");
    } catch {
      toast.error("Não foi possível parar de lançar as parcelas.");
    }
  }

  return (
    <Card className="min-w-0 gap-4 px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 className="font-heading font-medium text-base">Parcelas em Lançamentos</h2>
          <p className="max-w-2xl text-muted-foreground text-xs sm:text-sm">
            {settings
              ? `${formatDebtExpenseCounts(debt.expenseCounts)}, a partir da parcela ${settings.fromInstallment}. Reimportar o extrato ou mudar a correção atualiza só as pendentes.`
              : "Lance as parcelas a vencer como despesas pendentes numa conta. Elas entram em Contas a pagar, nos avisos de vencimento e nos lançamentos de cada mês."}
          </p>
        </div>
        {settings && !editing ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setEditing(true)} size="sm" type="button" variant="outline">
              Alterar
            </Button>
            <Button onClick={() => setStopOpen(true)} size="sm" type="button" variant="outline">
              Parar de lançar
            </Button>
          </div>
        ) : null}
      </div>

      {settings && !editing ? (
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground text-xs">Conta</dt>
            <dd className="font-medium">{accountName ?? "—"}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground text-xs">Categoria</dt>
            <dd className="font-medium">{categoryName ?? "—"}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground text-xs">Forma de pagamento</dt>
            <dd className="font-medium">{debtExpensePaymentMethodLabel(settings.paymentMethod)}</dd>
          </div>
        </dl>
      ) : accountsQuery.isSuccess && accounts.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Cadastre uma conta em Finanças → Contas para lançar as parcelas.
        </p>
      ) : (
        <DebtExpensesForm
          accounts={accounts}
          categories={categories}
          debtId={debt.id}
          initial={settings}
          key={`${settings?.accountId ?? "new"}-${editing}`}
          onCancel={settings ? () => setEditing(false) : undefined}
          onDone={() => setEditing(false)}
        />
      )}

      <AlertDialog onOpenChange={setStopOpen} open={stopOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Parar de lançar as parcelas?</AlertDialogTitle>
            <AlertDialogDescription>
              As parcelas pendentes saem de Lançamentos. As que já foram pagas continuam lá.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disableMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={disableMutation.isPending}
              onClick={() => void stop()}
              variant="destructive"
            >
              Parar de lançar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function DebtExpensesForm({
  accounts,
  categories,
  debtId,
  initial,
  onCancel,
  onDone,
}: {
  accounts: AccountOutput[];
  categories: CategoryOutput[];
  debtId: string;
  initial: DebtExpensesInput | null;
  onCancel?: () => void;
  onDone: () => void;
}) {
  const id = useId();
  const mutation = useEnableDebtExpensesMutation();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: {
      accountId: initial?.accountId ?? "",
      categoryId: initial?.categoryId ?? "",
      paymentMethod: initial?.paymentMethod ?? "boleto",
    },
    validators: { onSubmit: DebtExpensesInputSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        await mutation.mutateAsync({ id: debtId, input: DebtExpensesInputSchema.parse(value) });
        toast.success(initial ? "Lançamento das parcelas atualizado" : "Parcelas lançadas");
        onDone();
      } catch (cause) {
        setError(
          debtExpensesErrorMessage(cause instanceof ApiClientError ? cause.code : undefined),
        );
      }
    },
  });

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <form.Field name="accountId">
          {(field) => (
            <OptionField
              id={`${id}-account`}
              invalid={field.state.meta.errors.length > 0}
              label="Conta"
              onChange={field.handleChange}
              options={accounts.map((account) => ({ value: account.id, label: account.name }))}
              placeholder="Escolha a conta"
              value={field.state.value}
            />
          )}
        </form.Field>
        <form.Field name="categoryId">
          {(field) => (
            <OptionField
              id={`${id}-category`}
              invalid={field.state.meta.errors.length > 0}
              label="Categoria"
              onChange={field.handleChange}
              options={categories.map((category) => ({
                value: category.id,
                label: category.name,
              }))}
              placeholder="Escolha a categoria"
              value={field.state.value}
            />
          )}
        </form.Field>
        <form.Field name="paymentMethod">
          {(field) => (
            <OptionField
              id={`${id}-method`}
              invalid={false}
              label="Forma de pagamento"
              onChange={(value) => field.handleChange(value as DebtExpensesInput["paymentMethod"])}
              options={debtExpensePaymentMethodOptions}
              placeholder="Escolha a forma"
              value={field.state.value}
            />
          )}
        </form.Field>
      </div>
      <form.Subscribe selector={(state) => state.submissionAttempts > 0 && !state.isValid}>
        {(invalid) =>
          error || invalid ? (
            <p className="text-destructive text-sm" role="alert">
              {error ?? "Escolha a conta e a categoria."}
            </p>
          ) : null
        }
      </form.Subscribe>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(pending) => (
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} size="sm" type="submit">
              {pending ? "Lançando..." : initial ? "Salvar" : "Lançar parcelas"}
            </Button>
            {onCancel ? (
              <Button
                disabled={pending}
                onClick={onCancel}
                size="sm"
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
            ) : null}
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}

function OptionField({
  id,
  invalid,
  label,
  onChange,
  options,
  placeholder,
  value,
}: {
  id: string;
  invalid: boolean;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  value: string;
}) {
  const selected = options.find((option) => option.value === value);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        onValueChange={(next) => {
          if (typeof next === "string") onChange(next);
        }}
        value={value || null}
      >
        <SelectTrigger aria-invalid={invalid} className="h-10 w-full" id={id}>
          <SelectValue>
            {() => selected?.label ?? <span className="text-muted-foreground">{placeholder}</span>}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
