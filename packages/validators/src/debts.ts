import { z } from "@hono/zod-openapi";
import { debtExpensePaymentMethods } from "@openmonetis/domain/debt-expenses";
import {
  debtExtraAmortizationSources,
  debtStatementBanks,
  debtStatementInstallmentStatuses,
} from "@openmonetis/domain/debt-statements";
import { debtAmortizationSystems, debtExtraAmortizationModes } from "@openmonetis/domain/debts";

/** Upper bound for the projected monthly correction (5% a month), far above any real index. */
export const maxProjectedMonthlyCorrectionRate = 0.05;

export const ImportDebtStatementInputSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    contentBase64: z
      .string()
      .min(1)
      .max(7_100_000)
      .regex(/^[A-Za-z0-9+/]+=*$/),
  })
  .openapi("ImportDebtStatementInput");

const debtNameSchema = z.string().trim().min(1).max(120);

/** Renaming only; the same name rule as `UpdateDebtInputSchema`. */
export const DebtNameInputSchema = z.object({ name: debtNameSchema }).openapi("DebtNameInput");

export const UpdateDebtInputSchema = z
  .object({
    name: debtNameSchema.optional(),
    projectedMonthlyCorrectionRate: z
      .number()
      .finite()
      .min(0)
      .max(maxProjectedMonthlyCorrectionRate)
      .optional(),
  })
  .refine(
    (input) => input.name !== undefined || input.projectedMonthlyCorrectionRate !== undefined,
    {
      message: "Informe ao menos um campo",
    },
  )
  .openapi("UpdateDebtInput");

export const DebtParamsSchema = z.object({ id: z.uuid() });

/** Where the installments of a debt are launched as expenses. */
export const DebtExpensesInputSchema = z
  .object({
    accountId: z.uuid(),
    categoryId: z.uuid(),
    paymentMethod: z.enum(debtExpensePaymentMethods),
  })
  .openapi("DebtExpensesInput");

const DebtExpenseSettingsOutputSchema = z.object({
  accountId: z.uuid(),
  categoryId: z.uuid(),
  paymentMethod: z.enum(debtExpensePaymentMethods),
  /** First installment launched; earlier ones are left to the person's own records. */
  fromInstallment: z.number().int(),
});

const amountSchema = z.number().finite();

const DebtTotalsOutputSchema = z.object({
  amortization: amountSchema,
  interest: amountSchema,
  charges: amountSchema,
  extraPrincipal: amountSchema,
});

export const DebtOutputSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    bank: z.enum(debtStatementBanks),
    statementFormat: z.string(),
    contractReferenceSuffix: z.string(),
    statementIssuedOn: z.iso.date(),
    projectedMonthlyCorrectionRate: z.number(),
    terms: z.object({
      principal: amountSchema,
      contractDate: z.iso.date(),
      termMonths: z.number().int(),
      annualEffectiveRate: z.number(),
      amortizationSystem: z.enum(debtAmortizationSystems),
    }),
    summary: z.object({
      currentBalance: amountSchema,
      /** Due installments plus the full amount of the extras already made. */
      paidOut: amountSchema,
      paidInstallments: z.number().int(),
      remainingInstallments: z.number().int(),
      monthsCut: z.number().int(),
      lastDueDate: z.iso.date(),
      paid: DebtTotalsOutputSchema,
      remaining: DebtTotalsOutputSchema,
    }),
    nextInstallment: z
      .object({ number: z.number().int(), dueDate: z.iso.date(), amount: amountSchema })
      .nullable(),
    expenses: DebtExpenseSettingsOutputSchema.nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi("Debt");

export const DebtScheduleRowOutputSchema = z
  .object({
    number: z.number().int(),
    dueDate: z.iso.date(),
    status: z.enum(debtStatementInstallmentStatuses),
    amortization: amountSchema,
    interest: amountSchema,
    charges: z.array(z.object({ code: z.string(), amount: amountSchema })),
    installment: amountSchema,
    balanceAfter: amountSchema,
    extraPrincipal: amountSchema,
    remainingTermMonths: z.number().int(),
  })
  .openapi("DebtScheduleRow");

export const DebtExtraAmortizationOutputSchema = z
  .object({
    date: z.iso.date(),
    amount: amountSchema,
    proRataInterest: amountSchema,
    monetaryUpdate: amountSchema,
    /** What the extra took off the balance: amount minus pro-rata interest and monetary update. */
    principal: amountSchema,
    mode: z.enum(debtExtraAmortizationModes),
    source: z.enum(debtExtraAmortizationSources),
  })
  .openapi("DebtExtraAmortization");

export const DebtScheduleYearOutputSchema = z
  .object({
    year: z.number().int(),
    installments: z.number().int(),
    amortization: amountSchema,
    interest: amountSchema,
    charges: amountSchema,
    total: amountSchema,
    extraPrincipal: amountSchema,
    remainingOnly: z.boolean(),
  })
  .openapi("DebtScheduleYear");

export const DebtDetailOutputSchema = DebtOutputSchema.extend({
  schedule: z.array(DebtScheduleRowOutputSchema),
  extraAmortizations: z.array(DebtExtraAmortizationOutputSchema),
  yearlyBreakdown: z.array(DebtScheduleYearOutputSchema),
  /** Expenses launched for the installments: still pending and already paid. */
  expenseCounts: z.object({ pending: z.number().int(), settled: z.number().int() }),
}).openapi("DebtDetail");

export type ImportDebtStatementInput = z.infer<typeof ImportDebtStatementInputSchema>;
export type UpdateDebtInput = z.infer<typeof UpdateDebtInputSchema>;
export type DebtExpensesInput = z.infer<typeof DebtExpensesInputSchema>;
export type DebtOutput = z.infer<typeof DebtOutputSchema>;
export type DebtDetailOutput = z.infer<typeof DebtDetailOutputSchema>;
export type DebtScheduleRowOutput = z.infer<typeof DebtScheduleRowOutputSchema>;
export type DebtExtraAmortizationOutput = z.infer<typeof DebtExtraAmortizationOutputSchema>;
export type DebtScheduleYearOutput = z.infer<typeof DebtScheduleYearOutputSchema>;
