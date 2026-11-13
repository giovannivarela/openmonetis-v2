/** Ways a debt installment can be paid from an account; a credit card has its own invoice flow. */
export const debtExpensePaymentMethods = ["boleto", "debit_card", "pix", "bank_transfer"] as const;
export type DebtExpensePaymentMethod = (typeof debtExpensePaymentMethods)[number];

/** "{debt} · parcela " — the installment number completes the name of each expense. */
export function debtInstallmentExpenseNamePrefix(debtName: string) {
  return `${debtName} · parcela `;
}

/** An installment of the debt schedule, as the expense that pays it needs it. */
export type DebtInstallmentForExpense = {
  number: number;
  dueDate: string;
  installmentCents: number;
};

/** An expense already launched for an installment of the debt. */
export type DebtExpenseRecord = {
  id: string;
  installmentNumber: number;
  dueDate: string;
  amountCents: number;
  settled: boolean;
};

export type DebtExpensePlan = {
  create: DebtInstallmentForExpense[];
  update: Array<{ id: string; installment: DebtInstallmentForExpense }>;
  remove: string[];
};

/**
 * Brings the expenses of a debt in line with its schedule. Paid expenses are history and are never
 * changed. Pending ones follow the schedule: missing installments from `fromInstallment` on are
 * created, moved amounts or dates are updated, and installments that left the schedule (term cut by
 * an extra amortization) are removed.
 */
export function planDebtInstallmentExpenses(input: {
  installments: DebtInstallmentForExpense[];
  existing: DebtExpenseRecord[];
  fromInstallment: number;
}): DebtExpensePlan {
  const byNumber = new Map(input.installments.map((item) => [item.number, item]));
  const launched = new Set(input.existing.map((record) => record.installmentNumber));
  const pending = input.existing.filter((record) => !record.settled);
  return {
    create: input.installments.filter(
      (item) => item.number >= input.fromInstallment && !launched.has(item.number),
    ),
    update: pending.flatMap((record) => {
      const installment = byNumber.get(record.installmentNumber);
      return installment &&
        (installment.installmentCents !== record.amountCents ||
          installment.dueDate !== record.dueDate)
        ? [{ id: record.id, installment }]
        : [];
    }),
    remove: pending
      .filter((record) => !byNumber.has(record.installmentNumber))
      .map((record) => record.id),
  };
}
