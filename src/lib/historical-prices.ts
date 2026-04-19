// Binance symbol map (most coins) — returns monthly OHLCV candles from 2021
const BINANCE_SYMBOL: Record<string, string> = {
  XRP:  "XRPUSDT",
  NEXO: "NEXOUSDT",
  BTC:  "BTCUSDT",
  LINK: "LINKUSDT",
  ENJ:  "ENJUSDT",
  AXS:  "AXSUSDT",
  GALA: "GALAUSDT",
};

// CryptoCompare fsym for coins not on Binance
const CRYPTOCOMPARE_SYMBOL: Record<string, string> = {
  FLR: "FLR",
};

// Jan 1 2021 00:00:00 UTC in ms
const START_MS = 1609459200000;

type MonthlyPrices = Record<string, number>; // "YYYY-M" → USD close price

async function fetchBinanceMonthly(symbol: string): Promise<MonthlyPrices> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1M&startTime=${START_MS}&limit=100`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return {};
  const candles: [number, string, string, string, string, ...unknown[]][] = await res.json();
  const monthly: MonthlyPrices = {};
  for (const [openTimeMs, , , , close] of candles) {
    const d = new Date(openTimeMs);
    monthly[`${d.getFullYear()}-${d.getMonth()}`] = parseFloat(close as string);
  }
  return monthly;
}

async function fetchCryptoCompareMonthly(fsym: string): Promise<MonthlyPrices> {
  // histoday with large limit covers ~5 years of daily data; extract monthly close
  const url = `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${fsym}&tsym=USD&limit=1800`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return {};
  const json = await res.json();
  const days: { time: number; close: number }[] = json?.Data?.Data ?? [];
  const monthly: MonthlyPrices = {};
  for (const { time, close } of days) {
    const d = new Date(time * 1000);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    monthly[key] = close; // last day of each month wins
  }
  return monthly;
}

// Returns { symbol: { "YYYY-M": closePrice } }
export async function fetchMonthlyPrices(
  symbols: string[]
): Promise<Record<string, MonthlyPrices>> {
  const result: Record<string, MonthlyPrices> = {};

  for (const sym of symbols) {
    try {
      if (BINANCE_SYMBOL[sym]) {
        result[sym] = await fetchBinanceMonthly(BINANCE_SYMBOL[sym]);
      } else if (CRYPTOCOMPARE_SYMBOL[sym]) {
        result[sym] = await fetchCryptoCompareMonthly(CRYPTOCOMPARE_SYMBOL[sym]);
      }
    } catch {
      // leave undefined — consumers treat missing price as 0
    }
  }

  return result;
}
