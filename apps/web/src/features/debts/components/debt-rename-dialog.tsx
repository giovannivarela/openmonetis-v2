import { DebtNameInputSchema } from "@openmonetis/validators/debts";
import { useForm } from "@tanstack/react-form";
import { useId, useState } from "react";
import { toast } from "sonner";
import { MobileFormContent } from "@/components/forms/mobile-form-content";
import { MobileFormDialog } from "@/components/forms/mobile-form-dialog";
import { MobileFormState } from "@/components/forms/mobile-form-state";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showInvalidFormToast } from "@/lib/form-feedback";
import { useUpdateDebtMutation } from "../debts.mutations";

export function DebtRenameDialog({
  debtId,
  name,
  open,
  onOpenChange,
}: {
  debtId: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <MobileFormDialog onOpenChange={onOpenChange} open={open}>
      <MobileFormContent guarded>
        <DialogHeader>
          <DialogTitle>Renomear dívida</DialogTitle>
          <DialogDescription>O nome aparece na lista e no detalhe da dívida.</DialogDescription>
        </DialogHeader>
        <DebtRenameForm
          debtId={debtId}
          key={open ? "open" : "closed"}
          name={name}
          onDone={() => onOpenChange(false)}
        />
      </MobileFormContent>
    </MobileFormDialog>
  );
}

function DebtRenameForm({
  debtId,
  name,
  onDone,
}: {
  debtId: string;
  name: string;
  onDone: () => void;
}) {
  const id = useId();
  const mutation = useUpdateDebtMutation();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { name },
    validators: { onSubmit: DebtNameInputSchema },
    onSubmitInvalid: showInvalidFormToast,
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        await mutation.mutateAsync({ id: debtId, input: DebtNameInputSchema.parse(value) });
        toast.success("Dívida renomeada");
        onDone();
      } catch {
        setError("Não foi possível renomear a dívida. Tente novamente.");
      }
    },
  });

  return (
    <form
      className="grid gap-4"
      data-mobile-page-form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.Subscribe
        selector={(state) => ({ isDirty: !state.isDefaultValue, isSubmitting: state.isSubmitting })}
      >
        {(state) => <MobileFormState {...state} />}
      </form.Subscribe>
      <form.Field name="name">
        {(field) => (
          <div className="grid gap-2">
            <Label htmlFor={id}>Nome</Label>
            <Input
              aria-invalid={field.state.meta.errors.length > 0}
              autoFocus
              id={id}
              maxLength={120}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              value={field.state.value}
            />
            {field.state.meta.errors.length ? (
              <p className="text-destructive text-sm" role="alert">
                Informe um nome com até 120 caracteres.
              </p>
            ) : null}
          </div>
        )}
      </form.Field>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(pending) => (
          <div className="grid grid-cols-2 gap-2" data-mobile-form-actions>
            <Button
              data-mobile-cancel
              disabled={pending}
              onClick={onDone}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button disabled={pending} type="submit">
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}
