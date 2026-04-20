export interface SectorBreakdownMeta {
  asOf: string;
  sourceLabel: string;
  sourceUrl: string;
  weights: Record<string, number>;
}

const DIRECT_BUCKETS: Record<string, Record<string, number>> = {
  BTC: { "Digital Assets": 100 },
  ETH: { "Digital Assets": 100 },
  XRP: { "Digital Assets": 100 },
  NEXO: { "Digital Assets": 100 },
  LINK: { "Digital Assets": 100 },
  ENJ: { "Digital Assets": 100 },
  AXS: { "Digital Assets": 100 },
  GALA: { "Digital Assets": 100 },
  FLR: { "Digital Assets": 100 },
  SOL: { "Digital Assets": 100 },
  MATIC: { "Digital Assets": 100 },
  RENDER: { "Digital Assets": 100 },
  RNDR: { "Digital Assets": 100 },
  USDT: { "Cash & Stablecoins": 100 },
  USDC: { "Cash & Stablecoins": 100 },
  USD: { "Cash & Stablecoins": 100 },
  xUSD: { "Cash & Stablecoins": 100 },
  USDX: { "Cash & Stablecoins": 100 },
};

function normalizeSectorName(sector: string): string {
  switch (sector) {
    case "Technology Hardware & Equipment":
    case "Software & Computer Services":
      return "Information Technology";
    case "Banks":
    case "Investment Banking & Brokerage Services":
      return "Financials";
    case "Retailers":
    case "Automobiles & Parts":
      return "Consumer Discretionary";
    case "Pharmaceuticals & Biotechnology":
      return "Health Care";
    case "Industrial Support Services":
      return "Industrials";
    case "Non-Renewable Energy":
      return "Energy";
    case "Managed Funds":
      return "Managed Funds";
    case "Gold":
    case "Diversified Metals & Mining":
    case "Copper":
    case "Silver":
    case "Steel":
      return "Materials";
    case "Integrated Oil & Gas":
    case "Oil & Gas Storage & Transportation":
    case "Oil & Gas Exploration & Production":
      return "Energy";
    case "Cash":
    case "Cash and/or Derivatives":
      return "Cash & Stablecoins";
    case "Others":
      return "Other";
    default:
      return sector;
  }
}

function normalizeWeights(
  weights: Record<string, number>,
  otherSector = "Other"
): Record<string, number> {
  const normalized: Record<string, number> = {};

  for (const [sector, weight] of Object.entries(weights)) {
    const key = normalizeSectorName(sector);
    normalized[key] = (normalized[key] ?? 0) + weight;
  }

  const total = Object.values(normalized).reduce((sum, weight) => sum + weight, 0);
  if (total < 99.99) {
    normalized[otherSector] = (normalized[otherSector] ?? 0) + (100 - total);
  }

  return normalized;
}

export const LOOKTHROUGH_SECTORS: Record<string, SectorBreakdownMeta> = {
  CNX1: {
    asOf: "2026-04-08",
    sourceLabel: "BlackRock iShares NASDAQ 100 UCITS ETF sector exposure",
    sourceUrl: "https://www.blackrock.com/uk/intermediaries/products/253741/ishares-nasdaq-100-ucits-etf_1",
    weights: normalizeWeights({
      "Information Technology": 52.65,
      Communication: 15.24,
      "Consumer Discretionary": 12.59,
      "Consumer Staples": 7.7,
      "Health Care": 4.49,
      Industrials: 3.8,
      Utilities: 1.4,
      Materials: 1.14,
      Energy: 0.55,
      Financials: 0.24,
      "Real Estate": 0.08,
      "Cash and/or Derivatives": 0.11,
    }),
  },
  RBTX: {
    asOf: "2026-03-31",
    sourceLabel: "BlackRock iShares Automation & Robotics UCITS ETF sector exposure",
    sourceUrl: "https://www.blackrock.com/uk/intermediaries/products/284219/ishares-automation-robotics-ucits-etf-usd-acc-fund",
    weights: normalizeWeights({
      "Information Technology": 68.42,
      Industrials: 26.37,
      "Consumer Discretionary": 2.86,
      "Health Care": 1.99,
      Materials: 0.1,
      "Cash and/or Derivatives": 0.26,
    }),
  },
  MTAV: {
    asOf: "2025-12-30",
    sourceLabel: "BlackRock iShares Metaverse UCITS ETF sector exposure",
    sourceUrl: "https://www.blackrock.com/uk/intermediaries/products/329602/ishares-metaverse-ucits-etf",
    weights: normalizeWeights({
      "Information Technology": 41.86,
      Communication: 21.27,
      Financials: 15.79,
      "Consumer Discretionary": 13.91,
      Industrials: 3.48,
      "Health Care": 3.24,
      Materials: 0.14,
      "Cash and/or Derivatives": 0.3,
    }),
  },
  MYMAP8: {
    asOf: "2026-02-28",
    sourceLabel: "HL / Broadridge MyMap 8 Select ESG top sectors",
    sourceUrl: "https://www.hl.co.uk/funds/fund-discounts%2C-prices--and--factsheets/search-results/b/blackrock-mymap-8-select-esg-class-d-accumulation",
    weights: normalizeWeights({
      "Technology Hardware & Equipment": 19.0,
      "Software & Computer Services": 12.71,
      Banks: 6.42,
      Retailers: 5.8,
      "Pharmaceuticals & Biotechnology": 5.27,
      "Managed Funds": 5.11,
      "Investment Banking & Brokerage Services": 3.22,
      "Industrial Support Services": 2.95,
      "Non-Renewable Energy": 2.64,
      "Automobiles & Parts": 2.55,
    }),
  },
  JPMNR: {
    asOf: "2026-02-28",
    sourceLabel: "Trustnet / JPM Natural Resources sector breakdown",
    sourceUrl: "https://www2.trustnet.com/Factsheets/FundFactsheetPDF.aspx?fundCode=SPCOM&univ=O",
    weights: normalizeWeights({
      Gold: 24.3,
      "Integrated Oil & Gas": 20.1,
      "Diversified Metals & Mining": 14.8,
      Copper: 13.6,
      "Oil & Gas Storage & Transportation": 11.3,
      "Oil & Gas Exploration & Production": 9.2,
      Silver: 2.6,
      Steel: 1.3,
      Cash: 1.0,
      Others: 1.8,
    }),
  },
};

export interface SectorSlice {
  sector: string;
  value: number;
}

export interface SectorSourceNote {
  ticker: string;
  asOf: string;
  sourceLabel: string;
  sourceUrl: string;
}

export function getSectorWeightsForSymbol(symbol: string): Record<string, number> {
  return LOOKTHROUGH_SECTORS[symbol]?.weights ?? DIRECT_BUCKETS[symbol] ?? { Unclassified: 100 };
}

export function getSectorSourceNotes(symbols: string[]): SectorSourceNote[] {
  return symbols
    .filter((symbol, index) => symbols.indexOf(symbol) === index)
    .flatMap((symbol) => {
      const meta = LOOKTHROUGH_SECTORS[symbol];
      return meta
        ? [{ ticker: symbol, asOf: meta.asOf, sourceLabel: meta.sourceLabel, sourceUrl: meta.sourceUrl }]
        : [];
    });
}
