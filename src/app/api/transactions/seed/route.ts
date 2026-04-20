import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { parseTransactions } from "@/lib/parse-transactions";

export const dynamic = "force-dynamic";

// POST /api/transactions/seed — imports the CSV into the DB (idempotent, skips duplicates)
export async function POST() {
  try {
    const db = getDb();
    const csvTxs = parseTransactions();

    let inserted = 0;
    let skipped = 0;

    for (const tx of csvTxs) {
      const result = await db
        .insert(transactions)
        .values({
          id: tx.id,
          type: tx.type,
          assetType: "crypto",
          inputCurrency: tx.inputCurrency,
          inputAmount: String(tx.inputAmount),
          outputCurrency: tx.outputCurrency,
          outputAmount: String(tx.outputAmount),
          usdEquivalent: String(tx.usdEquivalent),
          details: tx.details,
          date: tx.date,
          source: "csv",
        })
        .onConflictDoNothing()
        .returning({ id: transactions.id });

      if (result.length > 0) inserted++;
      else skipped++;
    }

    return NextResponse.json({ total: csvTxs.length, inserted, skipped });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
