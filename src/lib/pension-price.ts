import {
  fetchMorningstarPrices,
  priceNearDate,
} from "./parse-pension";

export interface FundPriceResult {
  usd: number;
  usd_24h_change: number;
  gbp: number;
  gbpUsd: number;
  date: string;
}

// Fetches the latest NAV for JPMNR from Morningstar and converts to USD.
// Results are intended to be cached at the route layer (revalidate: 3600).
export async function fetchPensionFundPrice(): Promise<FundPriceResult | null> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const [priceMap, fxRes] = await Promise.all([
      fetchMorningstarPrices(tenDaysAgo, today),
      fetch("https://api.exchangerate-api.com/v4/latest/GBP"),
    ]);

    const gbpUsd: number = fxRes.ok
      ? ((await fxRes.json()).rates?.USD ?? 1.3)
      : 1.3;

    // Walk back to find the two most recent trading days
    const sortedDates = Object.keys(priceMap).sort();
    if (sortedDates.length === 0) return null;

    const latestDate = sortedDates[sortedDates.length - 1];
    const prevDate =
      sortedDates.length > 1
        ? sortedDates[sortedDates.length - 2]
        : latestDate;

    const latestGBP = priceMap[latestDate];
    const prevGBP = priceMap[prevDate];
    const latestUSD = latestGBP * gbpUsd;
    const prevUSD = prevGBP * gbpUsd;

    return {
      usd: latestUSD,
      usd_24h_change: ((latestUSD - prevUSD) / prevUSD) * 100,
      gbp: latestGBP,
      gbpUsd,
      date: latestDate,
    };
  } catch {
    return null;
  }
}
