import {
  cards,
  db,
  financialAccounts,
  people,
  transactionSplits,
  transactions,
} from "@openmonetis/db";
import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { CommitmentsRepository } from "../services/commitments.service";
import { financialDistributionRepository } from "./financial-distribution.repository";
import { installmentsRepository } from "./installments.repository";
import { effectiveSplitAmountSql, effectiveTransactionAmountSql } from "./settlements.repository";

const transactionPeople = alias(people, "commitments_transaction_people");
const splitPeople = alias(people, "commitments_split_people");
const transactionAccounts = alias(financialAccounts, "commitments_transaction_accounts");
const transactionCardAccounts = alias(financialAccounts, "commitments_card_accounts");

export const commitmentsRepository = {
  async listInstallmentRowsForUser(userId) {
    const [rows, hiddenAccounts] = await Promise.all([
      installmentsRepository.listForUser(userId, { personScope: "admin" }),
      db
        .select({ id: financialAccounts.id })
        .from(financialAccounts)
        .where(
          and(eq(financialAccounts.userId, userId), eq(financialAccounts.excludeFromBalance, true)),
        ),
    ]);
    // Same rule as the other layers: the account is the transaction's, or the card's account.
    const hiddenAccountIds = new Set(hiddenAccounts.map((account) => account.id));
    return rows.filter((row) => !row.accountId || !hiddenAccountIds.has(row.accountId));
  },

  listRecurringRulesForUser(userId, periodEnd) {
    return financialDistributionRepository.listRecurringRulesForUser(
      userId,
      periodEnd,
      [],
      "admin",
    );
  },

  /**
   * Single launches of the period (card purchases by invoice period), plus refunds and invoice
   * adjustments that reduce them. Installments and recurring series are read apart.
   */
  async listSingleEntriesForUser(userId, startPeriod, endPeriod) {
    const rows = await db
      .select({
        period: transactions.period,
        type: sql<"income" | "expense">`${transactions.type}::text`,
        origin: transactions.origin,
        debtId: transactions.debtId,
        amount:
          sql<string>`case when ${transactionSplits.id} is not null then ${effectiveSplitAmountSql} else ${effectiveTransactionAmountSql} end`.as(
            "amount",
          ),
      })
      .from(transactions)
      .leftJoin(cards, and(eq(transactions.cardId, cards.id), eq(cards.userId, userId)))
      .leftJoin(
        transactionAccounts,
        and(
          eq(transactions.accountId, transactionAccounts.id),
          eq(transactionAccounts.userId, userId),
        ),
      )
      .leftJoin(
        transactionCardAccounts,
        and(
          eq(cards.accountId, transactionCardAccounts.id),
          eq(transactionCardAccounts.userId, userId),
        ),
      )
      .innerJoin(
        transactionPeople,
        and(eq(transactions.personId, transactionPeople.id), eq(transactionPeople.userId, userId)),
      )
      .leftJoin(
        transactionSplits,
        and(
          eq(transactionSplits.transactionId, transactions.id),
          eq(transactionSplits.userId, userId),
        ),
      )
      .leftJoin(
        splitPeople,
        and(eq(transactionSplits.personId, splitPeople.id), eq(splitPeople.userId, userId)),
      )
      .where(
        and(
          eq(transactions.userId, userId),
          inArray(transactions.type, ["income", "expense"]),
          inArray(transactions.origin, ["regular", "refund", "invoiceAdjustment"]),
          eq(transactions.condition, "single"),
          gte(transactions.period, startPeriod),
          lte(transactions.period, endPeriod),
          sql`coalesce(${transactionAccounts.excludeFromBalance}, ${transactionCardAccounts.excludeFromBalance}, false) = false`,
          or(
            and(isNull(transactionSplits.id), eq(transactionPeople.role, "admin")),
            eq(splitPeople.role, "admin"),
          ),
        ),
      );
    return rows;
  },
} satisfies CommitmentsRepository;
