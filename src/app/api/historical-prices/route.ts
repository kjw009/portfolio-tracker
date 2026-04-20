import { NextResponse } from "next/server";
import { parseTransactions, computeDailySnapshots } from "@/lib/parse-transactions";

export const revalidate = 3600;

const HIDDEN = new Set(["xUSD", "USDX", "USD", "GBP", "GBPX"]);
const STABLE_USD: Record<string, number> = { USDT: 1, USDC: 1 };

async function fetchDailyPrices(fsym: string): Promise<Record<string, number>> {
  // "YYYY-MM-DD" → close price
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 1000));
    try {
      const res = await fetch(
        `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${fsym}&tsym=USD&limit=1800`
      );
      if (res.status === 429) continue;
      if (!res.ok) return {};
      const json = await res.json();
      if (json?.Response !== "Success") return {};
      const days: { time: number; close: number }[] = json?.Data?.Data ?? [];
      const out: Record<string, number> = {};
      for (const { time, close } of days) {
        const d = new Date(time * 1000);
        // Use UTC date string — close enough for daily granularity
        out[d.toISOString().slice(0, 10)] = close;
      }
      return out;
    } catch {
      // retry
    }
  }
  return {};
}

export async function GET() {
  const transactions = parseTransactions();
  const snapshots = computeDailySnapshots(transactions);

  // Collect all symbols that appear in any snapshot
  const symbols = [
    ...new Set(snapshots.flatMap((s) => Object.keys(s.balances))),
  ].filter((sym) => !HIDDEN.has(sym) && STABLE_USD[sym] === undefined);

  // Fetch daily prices sequentially to avoid rate limiting
  const prices: Record<string, Record<string, number>> = {};
  for (const sym of symbols) {
    prices[sym] = await fetchDailyPrices(sym);
    await new Promise((r) => setTimeout(r, 200));
  }

  // Precompute the most recent available price for each symbol.
  // CryptoCompare only has data up to the previous UTC close, so today's
  // snapshot would get price=0 without this carry-forward.
  const latestPrice: Record<string, number> = {};
  for (const [sym, priceMap] of Object.entries(prices)) {
    const sorted = Object.keys(priceMap).sort();
    if (sorted.length > 0) latestPrice[sym] = priceMap[sorted[sorted.length - 1]];
  }

  // Build timeline — one point per day
  const timeline = snapshots.map((snap) => {
    let portfolioValue = 0;
    for (const [sym, amount] of Object.entries(snap.balances)) {
      if (HIDDEN.has(sym) || amount <= 0.000001) continue;
      // Use exact date price → fall back to most recent known price
      const price = STABLE_USD[sym] ?? prices[sym]?.[snap.dateStr] ?? latestPrice[sym] ?? 0;
      portfolioValue += amount * price;
    }
    return {
      date: snap.dateStr,
      timestamp: snap.timestamp,
      portfolioValue: Math.round(portfolioValue),
      netInvested: snap.netInvested,
    };
  });

  return NextResponse.json(timeline, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
