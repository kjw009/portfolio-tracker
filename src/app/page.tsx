import {
  parseTransactions,
  computeHoldings,
  computeInterestEarned,
  dbRowToTransaction,
} from "@/lib/parse-transactions";
import PortfolioDashboard from "@/components/portfolio-dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  let transactions;
  let dbAvailable = false;

  if (process.env.DATABASE_URL) {
    try {
      const { getDb } = await import("@/lib/db");
      const { transactions: txTable } = await import("@/lib/db/schema");
      const { asc } = await import("drizzle-orm");

      const db = getDb();
      const rows = await db.select().from(txTable).orderBy(asc(txTable.date));
      transactions = rows.map(dbRowToTransaction);
      dbAvailable = true;
    } catch {
      // DB not yet set up or unreachable — fall back to CSV
    }
  }

  if (!transactions) {
    transactions = parseTransactions();
  }

  const holdings = computeHoldings(transactions);
  const interestEarned = computeInterestEarned(transactions);

  return (
    <PortfolioDashboard
      holdings={holdings}
      transactions={transactions}
      interestEarned={interestEarned}
      dbAvailable={dbAvailable}
    />
  );
}
