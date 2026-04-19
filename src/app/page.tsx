import {
  parseTransactions,
  computeHoldings,
  computeInterestEarned,
  computePortfolioTimeline,
  computeMonthlySnapshots,
} from "@/lib/parse-transactions";
import { fetchMonthlyPrices } from "@/lib/historical-prices";
import PortfolioDashboard from "@/components/portfolio-dashboard";

export const dynamic = "force-dynamic";

const HIDDEN = new Set(["xUSD", "USDX", "USD", "GBP", "GBPX"]);
const STABLE_USD: Record<string, number> = { USDT: 1, USDC: 1 };

export default async function Home() {
  const transactions = parseTransactions();
  const holdings = computeHoldings(transactions);
  const interestEarned = computeInterestEarned(transactions);
  const baseTimeline = computePortfolioTimeline(transactions);
  const snapshots = computeMonthlySnapshots(transactions);

  const symbols = [
    ...new Set(snapshots.flatMap((s) => Object.keys(s.balances))),
  ].filter((sym) => !HIDDEN.has(sym) && STABLE_USD[sym] === undefined);

  const historicalPrices = await fetchMonthlyPrices(symbols);

  // Build a lookup: "YYYY-M" → snapshot balances
  const snapshotMap = new Map(snapshots.map((s) => [`${s.year}-${s.month}`, s]));

  const timeline = baseTimeline.map((point) => {
    const d = new Date(point.timestamp);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const snap = snapshotMap.get(key);
    let portfolioValue = 0;
    if (snap) {
      for (const [sym, amount] of Object.entries(snap.balances)) {
        if (HIDDEN.has(sym) || amount <= 0.000001) continue;
        const price = STABLE_USD[sym] ?? historicalPrices[sym]?.[key] ?? 0;
        portfolioValue += amount * price;
      }
    }
    return { ...point, portfolioValue: Math.round(portfolioValue) };
  });

  return (
    <PortfolioDashboard
      holdings={holdings}
      transactions={transactions}
      interestEarned={interestEarned}
      timeline={timeline}
    />
  );
}
