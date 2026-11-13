import type { DebtDetailOutput } from "@openmonetis/validators/debts";
import { useForm } from "@tanstack/react-form";
import { FileText } from "lucide-react";
import { useId, useState } from "react";
import { MobileFormContent } from "@/components/forms/mobile-form-content";
import { MobileFormDialog } from "@/components/forms/mobile-form-dialog";
import { MobileFormState } from "@/components/forms/mobile-form-state";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ApiClientError } from "@/lib/api-client";
import { useImportDebtStatementMutation } from "../debts.mutations";
import { debtImportErrorMessage, validateDebtStatementFile } from "../debts.presentation";

export function DebtImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (debt: DebtDetailOutput) => void;
}) {
  return (
    <MobileFormDialog onOpenChange={onOpenChange} open={open}>
      <MobileFormContent guarded>
        <DialogHeader>
          <DialogTitle>Importar extrato</DialogTitle>
          <DialogDescription>
            Envie o PDF do demonstrativo do financiamento (DDC do Itaú). Reimportar o mesmo contrato
            atualiza a dívida, sem duplicar.
          </DialogDescription>
        </DialogHeader>
        <DebtImportForm
          key={open ? "open" : "closed"}
          onCancel={() => onOpenChange(false)}
          onImported={onImported}
        />
      </MobileFormContent>
    </MobileFormDialog>
  );
}

function DebtImportForm({
  onCancel,
  onImported,
}: {
  onCancel: () => void;
  onImported: (debt: DebtDetailOutput) => void;
}) {
  const id = useId();
  const mutation = useImportDebtStatementMutation();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { file: null as File | null },
    validators: {
      onSubmit: ({ value }) =>
        value.file
          ? (validateDebtStatementFile(value.file) ?? undefined)
          : "Escolha o PDF do extrato.",
    },
    onSubmit: async ({ value }) => {
      if (!value.file) return;
      setError(null);
      try {
        onImported(await mutation.mutateAsync(value.file));
      } catch (cause) {
        setError(debtImportErrorMessage(cause instanceof ApiClientError ? cause.code : undefined));
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
      <form.Field name="file">
        {(field) => (
          <div className="grid gap-2">
            <Label htmlFor={id}>Arquivo PDF</Label>
            <label
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-input border-dashed px-4 py-3 text-sm focus-within:ring-3 focus-within:ring-ring/50 hover:bg-muted/40"
              htmlFor={id}
            >
              <FileText aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate">
                {field.state.value ? field.state.value.name : "Escolher arquivo"}
              </span>
              <input
                accept="application/pdf,.pdf"
                className="sr-only"
                id={id}
                onChange={(event) => {
                  setError(null);
                  field.handleChange(event.target.files?.[0] ?? null);
                }}
                type="file"
              />
            </label>
            <p className="text-muted-foreground text-xs">
              O PDF é lido e descartado; só os dados do extrato ficam guardados.
            </p>
          </div>
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.errors}>
        {(errors) => {
          const message = error ?? (typeof errors[0] === "string" ? errors[0] : null);
          return message ? (
            <p className="text-destructive text-sm" role="alert">
              {message}
            </p>
          ) : null;
        }}
      </form.Subscribe>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(pending) => (
          <div className="grid grid-cols-2 gap-2" data-mobile-form-actions>
            <Button
              data-mobile-cancel
              disabled={pending}
              onClick={onCancel}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button disabled={pending} type="submit">
              {pending ? "Importando..." : "Importar"}
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}
