import { NextResponse } from "next/server";
import { fetchPensionFundPrice } from "@/lib/pension-price";
import { PENSION_TICKER } from "@/lib/parse-pension";

// CoinGecko free API IDs for each currency
const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  XRP: "ripple",
  NEXO: "nexo",
  USDT: "tether",
  USDC: "usd-coin",
  LINK: "chainlink",
  ENJ: "enjincoin",
  AXS: "axie-infinity",
  GALA: "gala",
  FLR: "flare-networks",
  SOL: "solana",
  MATIC: "matic-network",
  RENDER: "render-token",
  RNDR: "render-token",
};

// Fixed-price assets (stablecoins / fiat)
const FIXED_PRICES: Record<string, number> = {
  USDT: 1,
  USDC: 1,
  xUSD: 1,
  USDX: 1,
  USD: 1,
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const currencies = (searchParams.get("currencies") || "").split(",").filter(Boolean);

  const prices: Record<string, { usd: number; usd_24h_change: number }> = {};

  // Set fixed prices
  for (const cur of currencies) {
    if (FIXED_PRICES[cur] !== undefined) {
      prices[cur] = { usd: FIXED_PRICES[cur], usd_24h_change: 0 };
    }
  }

  // Fetch live prices from CoinGecko
  const toFetch = currencies.filter((c) => COINGECKO_IDS[c] && !FIXED_PRICES[c]);
  const ids = [...new Set(toFetch.map((c) => COINGECKO_IDS[c]))].join(",");

  if (ids) {
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
        { next: { revalidate: 60 } } // cache 60s
      );
      if (res.ok) {
        const data = await res.json();
        for (const cur of toFetch) {
          const cgId = COINGECKO_IDS[cur];
          if (data[cgId]) {
            prices[cur] = {
              usd: data[cgId].usd,
              usd_24h_change: data[cgId].usd_24h_change ?? 0,
            };
          }
        }
      }
    } catch {
      // Return what we have
    }
  }

  // Fetch pension fund price if JPMNR is requested
  if (currencies.includes(PENSION_TICKER)) {
    const fund = await fetchPensionFundPrice();
    if (fund) {
      prices[PENSION_TICKER] = { usd: fund.usd, usd_24h_change: fund.usd_24h_change };
    }
  }

  return NextResponse.json(prices);
}
