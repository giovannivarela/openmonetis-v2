CREATE TYPE "public"."debt_bank" AS ENUM('itau');--> statement-breakpoint
CREATE TABLE "debt_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"debt_id" uuid NOT NULL,
	"issued_on" date NOT NULL,
	"statement" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"bank" "debt_bank" NOT NULL,
	"statement_format" varchar(32) NOT NULL,
	"contract_reference" varchar(64) NOT NULL,
	"projected_monthly_correction_rate" numeric(8, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debts_name_not_blank_check" CHECK (btrim("debts"."name") <> ''),
	CONSTRAINT "debts_projected_correction_range_check" CHECK ("debts"."projected_monthly_correction_rate" >= 0 AND "debts"."projected_monthly_correction_rate" <= 0.05)
);
--> statement-breakpoint
ALTER TABLE "debt_statements" ADD CONSTRAINT "debt_statements_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "debts_id_user_id_unique" ON "debts" USING btree ("id","user_id");--> statement-breakpoint
ALTER TABLE "debt_statements" ADD CONSTRAINT "debt_statements_debt_user_fk" FOREIGN KEY ("debt_id","user_id") REFERENCES "public"."debts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "debt_statements_debt_issued_on_unique" ON "debt_statements" USING btree ("debt_id","issued_on");--> statement-breakpoint
CREATE INDEX "debt_statements_user_id_idx" ON "debt_statements" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "debts_user_bank_contract_unique" ON "debts" USING btree ("user_id","bank","contract_reference");