interface YahooChartResult {
  meta?: {
    currency?: string;
    regularMarketPrice?: number;
    chartPreviousClose?: number;
  };
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      close?: Array<number | null>;
    }>;
  };
}

export interface LiveUsdPrice {
  usd: number;
  usd_24h_change: number;
}

type QuoteCurrency = "USD" | "GBP" | "GBp";

interface MarketSymbolConfig {
  yahooSymbol: string;
  currency: QuoteCurrency;
}

const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const GBPUSD_SYMBOL = "GBPUSD=X";

export const MARKET_SYMBOLS: Record<string, MarketSymbolConfig> = {
  RBTX: { yahooSymbol: "RBTX.L", currency: "GBp" },
  CNX1: { yahooSymbol: "CNX1.L", currency: "GBp" },
  MTAV: { yahooSymbol: "MTAV.AS", currency: "USD" },
  MYMAP8: { yahooSymbol: "0P0001ONUK.L", currency: "GBP" },
};

function toDateMap(result?: YahooChartResult): Record<string, number> {
  const out: Record<string, number> = {};
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];

  for (let i = 0; i < Math.min(timestamps.length, closes.length); i++) {
    const close = closes[i];
    if (typeof close !== "number" || !Number.isFinite(close)) continue;
    out[new Date(timestamps[i] * 1000).toISOString().slice(0, 10)] = close;
  }

  return out;
}

function nearestOnOrBefore(priceMap: Record<string, number>, isoDate: string): number {
  if (priceMap[isoDate] !== undefined) return priceMap[isoDate];

  const dates = Object.keys(priceMap).sort();
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i] <= isoDate) return priceMap[dates[i]];
  }

  return 0;
}

async function fetchYahooChart(
  symbol: string,
  query: string,
  revalidateSeconds: number
): Promise<YahooChartResult | null> {
  try {
    const res = await fetch(`${YAHOO_CHART_BASE}/${encodeURIComponent(symbol)}?${query}`, {
      next: { revalidate: revalidateSeconds },
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.chart?.result?.[0] ?? null;
  } catch {
    return null;
  }
}

function convertToUsd(
  rawPrice: number,
  currency: QuoteCurrency,
  gbpUsd: number
): number {
  if (currency === "USD") return rawPrice;
  if (currency === "GBP") return rawPrice * gbpUsd;
  return (rawPrice / 100) * gbpUsd;
}

export async function fetchLiveMarketUsdPrices(
  tickers: string[]
): Promise<Record<string, LiveUsdPrice>> {
  const wanted = tickers.filter((ticker) => MARKET_SYMBOLS[ticker]);
  if (wanted.length === 0) return {};

  const uniqueSymbols = [
    ...new Set(wanted.map((ticker) => MARKET_SYMBOLS[ticker].yahooSymbol).concat(GBPUSD_SYMBOL)),
  ];

  const charts = await Promise.all(
    uniqueSymbols.map(async (symbol) => [
      symbol,
      await fetchYahooChart(symbol, "range=1mo&interval=1d&includePrePost=false&events=history", 60),
    ] as const)
  );

  const chartMap = Object.fromEntries(charts);
  const fxResult = chartMap[GBPUSD_SYMBOL];
  const fxSeries = toDateMap(fxResult ?? undefined);
  const latestFxDate = Object.keys(fxSeries).sort().at(-1);
  const latestGbpUsd =
    (latestFxDate ? fxSeries[latestFxDate] : undefined) ??
    fxResult?.meta?.regularMarketPrice ??
    1.3;
  const previousGbpUsd =
    (latestFxDate ? nearestOnOrBefore(fxSeries, "9999-12-31") : 0) || latestGbpUsd;

  const prices: Record<string, LiveUsdPrice> = {};

  for (const ticker of wanted) {
    const config = MARKET_SYMBOLS[ticker];
    const result = chartMap[config.yahooSymbol];
    if (!result?.meta?.regularMarketPrice) continue;

    const currentUsd = convertToUsd(result.meta.regularMarketPrice, config.currency, latestGbpUsd);
    const previousRaw = result.meta.chartPreviousClose ?? result.meta.regularMarketPrice;
    const previousUsd = convertToUsd(previousRaw, config.currency, previousGbpUsd);
    const changePct = previousUsd > 0 ? ((currentUsd - previousUsd) / previousUsd) * 100 : 0;

    prices[ticker] = {
      usd: currentUsd,
      usd_24h_change: changePct,
    };
  }

  return prices;
}

export async function fetchHistoricalMarketUsdPrices(
  tickers: string[]
): Promise<Record<string, Record<string, number>>> {
  const wanted = tickers.filter((ticker) => MARKET_SYMBOLS[ticker]);
  if (wanted.length === 0) return {};

  const uniqueSymbols = [
    ...new Set(wanted.map((ticker) => MARKET_SYMBOLS[ticker].yahooSymbol).concat(GBPUSD_SYMBOL)),
  ];

  const charts = await Promise.all(
    uniqueSymbols.map(async (symbol) => [
      symbol,
      await fetchYahooChart(symbol, "range=10y&interval=1d&includePrePost=false&events=history", 3600),
    ] as const)
  );

  const chartMap = Object.fromEntries(charts);
  const fxMap = toDateMap(chartMap[GBPUSD_SYMBOL] ?? undefined);

  const out: Record<string, Record<string, number>> = {};

  for (const ticker of wanted) {
    const config = MARKET_SYMBOLS[ticker];
    const rawMap = toDateMap(chartMap[config.yahooSymbol] ?? undefined);
    const usdMap: Record<string, number> = {};

    for (const [date, rawPrice] of Object.entries(rawMap)) {
      const gbpUsd = nearestOnOrBefore(fxMap, date) || 1.3;
      usdMap[date] = convertToUsd(rawPrice, config.currency, gbpUsd);
    }

    out[ticker] = usdMap;
  }

  return out;
}

export function priceNearMarketDate(priceMap: Record<string, number>, isoDate: string): number {
  return nearestOnOrBefore(priceMap, isoDate);
}
