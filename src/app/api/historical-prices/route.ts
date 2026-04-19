import { NextResponse } from "next/server";

export const revalidate = 3600;

const SYMBOLS = ["XRP", "NEXO", "BTC", "LINK", "ENJ", "AXS", "GALA", "FLR"];

async function fetchCryptoCompare(fsym: string): Promise<Record<string, number>> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 1000));
    try {
      const res = await fetch(
        `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${fsym}&tsym=USD&limit=1800`
      );
      if (res.status === 429) continue; // retry on rate limit
      if (!res.ok) return {};
      const json = await res.json();
      if (json?.Response !== "Success") return {};
      const days: { time: number; close: number }[] = json?.Data?.Data ?? [];
      const monthly: Record<string, number> = {};
      for (const { time, close } of days) {
        const d = new Date(time * 1000);
        monthly[`${d.getFullYear()}-${d.getMonth()}`] = close;
      }
      return monthly;
    } catch {
      // fall through to retry
    }
  }
  return {};
}

export async function GET() {
  const data: Record<string, Record<string, number>> = {};

  // Sequential with 200ms gap to stay within CryptoCompare free-tier rate limits
  for (const sym of SYMBOLS) {
    data[sym] = await fetchCryptoCompare(sym);
    await new Promise((r) => setTimeout(r, 200));
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
