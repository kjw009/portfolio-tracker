import { pgTable, text, numeric, timestamp } from "drizzle-orm/pg-core";

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  assetType: text("asset_type").notNull().default("crypto"),
  inputCurrency: text("input_currency").notNull(),
  inputAmount: numeric("input_amount", { precision: 36, scale: 18 }).notNull(),
  outputCurrency: text("output_currency").notNull(),
  outputAmount: numeric("output_amount", { precision: 36, scale: 18 }).notNull(),
  usdEquivalent: numeric("usd_equivalent", { precision: 18, scale: 6 }).notNull().default("0"),
  details: text("details").notNull().default(""),
  date: timestamp("date", { withTimezone: true }).notNull(),
  source: text("source").notNull().default("manual"), // "csv" | "manual"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;
