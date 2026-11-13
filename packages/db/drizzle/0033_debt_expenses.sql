ALTER TABLE "debts" ADD COLUMN "expense_account_id" uuid;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "expense_category_id" uuid;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "expense_payment_method" "payment_method";--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "expense_from_installment" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "debt_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "debt_installment_number" integer;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_expense_account_id_financial_accounts_id_fk" FOREIGN KEY ("expense_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_expense_category_id_categories_id_fk" FOREIGN KEY ("expense_category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_debt_installment_unique" ON "transactions" USING btree ("debt_id","debt_installment_number") WHERE "transactions"."debt_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_expense_settings_check" CHECK ((
        "debts"."expense_account_id" IS NULL
        AND "debts"."expense_category_id" IS NULL
        AND "debts"."expense_payment_method" IS NULL
        AND "debts"."expense_from_installment" IS NULL
      ) OR (
        "debts"."expense_account_id" IS NOT NULL
        AND "debts"."expense_category_id" IS NOT NULL
        AND "debts"."expense_payment_method" IS NOT NULL
        AND "debts"."expense_payment_method" <> 'credit_card'
        AND "debts"."expense_from_installment" >= 1
      ));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_debt_installment_check" CHECK ("transactions"."debt_id" IS NULL OR "transactions"."debt_installment_number" >= 1);