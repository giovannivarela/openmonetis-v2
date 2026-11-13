import { useForm } from "@tanstack/react-form";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { useUpdateDebtMutation } from "../debts.mutations";
import { formatDebtCorrectionRate, parseDebtCorrectionRate } from "../debts.presentation";

const invalidRate = "Informe uma taxa entre 0 e 5% ao mês.";

/** The monthly correction (TR) assumed for installments the bank has not projected yet. */
export function DebtCorrectionForm({ debtId, rate }: { debtId: string; rate: number }) {
  const id = useId();
  const mutation = useUpdateDebtMutation();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { rate: formatDebtCorrectionRate(rate) },
    validators: {
      onSubmit: ({ value }) =>
        parseDebtCorrectionRate(value.rate) === null ? invalidRate : undefined,
    },
    onSubmit: async ({ value }) => {
      const projectedMonthlyCorrectionRate = parseDebtCorrectionRate(value.rate);
      if (projectedMonthlyCorrectionRate === null) return;
      setError(null);
      try {
        await mutation.mutateAsync({ id: debtId, input: { projectedMonthlyCorrectionRate } });
        toast.success("Projeção atualizada");
      } catch {
        setError("Não foi possível atualizar a projeção. Tente novamente.");
      }
    },
  });

  return (
    <form
      className="grid gap-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <Label htmlFor={id}>Correção mensal projetada (TR)</Label>
      <div className="flex flex-wrap items-center gap-2">
        <form.Field name="rate">
          {(field) => (
            <InputGroup className="w-40">
              <InputGroupInput
                aria-invalid={field.state.meta.errors.length > 0}
                id={id}
                inputMode="decimal"
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                value={field.state.value}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>% a.m.</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          )}
        </form.Field>
        <form.Subscribe selector={(state) => [state.isSubmitting, state.isDefaultValue] as const}>
          {([pending, unchanged]) => (
            <Button disabled={pending || unchanged} size="sm" type="submit" variant="outline">
              {pending ? "Aplicando..." : "Aplicar"}
            </Button>
          )}
        </form.Subscribe>
      </div>
      <form.Subscribe selector={(state) => state.errors}>
        {(errors) => {
          const message = error ?? (typeof errors[0] === "string" ? errors[0] : null);
          return message ? (
            <p className="text-destructive text-sm" role="alert">
              {message}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Vale só para as parcelas que o banco ainda não projetou. As do extrato não mudam.
            </p>
          );
        }}
      </form.Subscribe>
    </form>
  );
}
