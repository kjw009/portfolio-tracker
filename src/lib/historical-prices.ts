const SYMBOL_TO_ID: Record<string, string> = {
  XRP: "ripple",
  NEXO: "nexo",
  BTC: "bitcoin",
  LINK: "chainlink",
  ENJ: "enjincoin",
  AXS: "axie-infinity",
  GALA: "gala",
  FLR: "flare-networks",
};

// Returns { symbol: { "YYYY-M": lastPriceInMonth } }
export async function fetchMonthlyPrices(
  symbols: string[]
): Promise<Record<string, Record<string, number>>> {
  const from = 1609459200; // Jan 1 2021 UTC
  const to = Math.floor(Date.now() / 86400000) * 86400; // today midnight, stable cache key
  const result: Record<string, Record<string, number>> = {};

  for (const sym of symbols) {
    const id = SYMBOL_TO_ID[sym];
    if (!id) continue;
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/${id}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`,
        { next: { revalidate: 3600 } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const prices: [number, number][] = data.prices ?? [];
      const monthly: Record<string, number> = {};
      for (const [ts, price] of prices) {
        const d = new Date(ts);
        monthly[`${d.getFullYear()}-${d.getMonth()}`] = price; // last price overwrites = month-end
      }
      result[sym] = monthly;
    } catch {
      // price data unavailable for this symbol — will show 0 contribution
    }
  }

  return result;
}
