import { NextResponse } from "next/server";

export const revalidate = 3600; // cache for 1 hour

const BINANCE_SYMBOL: Record<string, string> = {
  XRP:  "XRPUSDT",
  NEXO: "NEXOUSDT",
  BTC:  "BTCUSDT",
  LINK: "LINKUSDT",
  ENJ:  "ENJUSDT",
  AXS:  "AXSUSDT",
  GALA: "GALAUSDT",
};

const START_MS = 1609459200000; // Jan 1 2021

async function binanceMonthly(symbol: string): Promise<Record<string, number>> {
  const res = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1M&startTime=${START_MS}&limit=100`
  );
  if (!res.ok) return {};
  const candles: [number, string, string, string, string, ...unknown[]][] = await res.json();
  const out: Record<string, number> = {};
  for (const [openMs, , , , close] of candles) {
    const d = new Date(openMs);
    out[`${d.getFullYear()}-${d.getMonth()}`] = parseFloat(close as string);
  }
  return out;
}

async function cryptoCompareMonthly(fsym: string): Promise<Record<string, number>> {
  const res = await fetch(
    `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${fsym}&tsym=USD&limit=1800`
  );
  if (!res.ok) return {};
  const json = await res.json();
  const days: { time: number; close: number }[] = json?.Data?.Data ?? [];
  const out: Record<string, number> = {};
  for (const { time, close } of days) {
    const d = new Date(time * 1000);
    out[`${d.getFullYear()}-${d.getMonth()}`] = close;
  }
  return out;
}

export async function GET() {
  const results = await Promise.allSettled([
    ...Object.entries(BINANCE_SYMBOL).map(async ([sym, bSym]) => ({
      sym,
      prices: await binanceMonthly(bSym),
    })),
    (async () => ({ sym: "FLR", prices: await cryptoCompareMonthly("FLR") }))(),
  ]);

  const data: Record<string, Record<string, number>> = {};
  for (const r of results) {
    if (r.status === "fulfilled") {
      data[r.value.sym] = r.value.prices;
    }
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
