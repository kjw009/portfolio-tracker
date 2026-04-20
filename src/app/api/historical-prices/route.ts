import { NextResponse } from "next/server";
import {
  parseTransactions,
  computeDailySnapshots,
  dbRowToTransaction,
} from "@/lib/parse-transactions";
import {
  fetchMorningstarPrices,
  priceNearDate,
  PENSION_TICKER,
} from "@/lib/parse-pension";

export const revalidate = 3600;

const HIDDEN = new Set(["xUSD", "USDX", "USD", "GBP", "GBPX"]);
const STABLE_USD: Record<string, number> = { USDT: 1, USDC: 1 };

async function fetchCryptoDailyPrices(fsym: string): Promise<Record<string, number>> {
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
        out[new Date(time * 1000).toISOString().slice(0, 10)] = close;
      }
      return out;
    } catch {
      // retry
    }
  }
  return {};
}

export async function GET() {
  // Use DB transactions when available (includes pension + any manual entries),
  // otherwise fall back to the Nexo CSV.
  let transactions;
  if (process.env.DATABASE_URL) {
    try {
      const { getDb } = await import("@/lib/db");
      const { transactions: txTable } = await import("@/lib/db/schema");
      const { asc } = await import("drizzle-orm");
      const db = getDb();
      const rows = await db.select().from(txTable).orderBy(asc(txTable.date));
      if (rows.length > 0) transactions = rows.map(dbRowToTransaction);
    } catch {
      // fall through
    }
  }
  if (!transactions) transactions = parseTransactions();

  const snapshots = computeDailySnapshots(transactions);

  // Collect symbols — split pension from crypto
  const allSymbols = [
    ...new Set(snapshots.flatMap((s) => Object.keys(s.balances))),
  ].filter((sym) => !HIDDEN.has(sym) && STABLE_USD[sym] === undefined);

  const cryptoSymbols = allSymbols.filter((s) => s !== PENSION_TICKER);
  const hasPension = allSymbols.includes(PENSION_TICKER);

  // Fetch crypto prices from CryptoCompare (sequential to avoid rate limiting)
  const prices: Record<string, Record<string, number>> = {};
  for (const sym of cryptoSymbols) {
    prices[sym] = await fetchCryptoDailyPrices(sym);
    await new Promise((r) => setTimeout(r, 200));
  }

  // Fetch pension fund NAV from Morningstar if needed, convert to USD
  if (hasPension) {
    const firstSnap = snapshots.find((s) => (s.balances[PENSION_TICKER] ?? 0) > 0);
    const startDate = firstSnap?.dateStr ?? snapshots[0]?.dateStr ?? "2022-01-01";
    const endDate = new Date().toISOString().slice(0, 10);

    const [navMap, fxRes] = await Promise.all([
      fetchMorningstarPrices(startDate, endDate),
      fetch("https://api.exchangerate-api.com/v4/latest/GBP"),
    ]);
    const gbpUsd: number = fxRes.ok ? ((await fxRes.json()).rates?.USD ?? 1.3) : 1.3;

    // Convert GBP NAV → USD price map
    const pensionUSD: Record<string, number> = {};
    for (const [date, nav] of Object.entries(navMap)) {
      pensionUSD[date] = nav * gbpUsd;
    }
    prices[PENSION_TICKER] = pensionUSD;
  }

  // Carry-forward: use most recent known price for any day without data
  const latestPrice: Record<string, number> = {};
  for (const [sym, priceMap] of Object.entries(prices)) {
    const sorted = Object.keys(priceMap).sort();
    if (sorted.length > 0) latestPrice[sym] = priceMap[sorted[sorted.length - 1]];
  }

  // For pension, also use priceNearDate (handles weekends/holidays)
  const timeline = snapshots.map((snap) => {
    let portfolioValue = 0;
    for (const [sym, amount] of Object.entries(snap.balances)) {
      if (HIDDEN.has(sym) || amount <= 0.000001) continue;
      let price: number;
      if (sym === PENSION_TICKER) {
        // Use Morningstar carry-forward logic (walks back for non-trading days)
        price = priceNearDate(prices[sym] ?? {}, snap.dateStr) || latestPrice[sym] || 0;
      } else {
        price = STABLE_USD[sym] ?? prices[sym]?.[snap.dateStr] ?? latestPrice[sym] ?? 0;
      }
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
