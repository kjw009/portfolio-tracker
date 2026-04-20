import fs from "fs";
import path from "path";

export const PENSION_TICKER = "JPMNR";
export const PENSION_FUND_NAME = "SL JP Morgan Natural Resources Pension Fund";
export const PENSION_MORNINGSTAR_ID = "F000000LBJ";
export const PENSION_MORNINGSTAR_TOKEN = "klr5zyak8x";

// 3/8 of each contribution comes from the employee (the cost basis we track)
export const EMPLOYEE_FRACTION = 3 / 8;

export interface PensionContribution {
  date: Date;
  isoDate: string; // "YYYY-MM-DD"
  grossGBP: number;
  employeeGBP: number; // 3/8
  employerGBP: number; // 5/8
}

export function parsePensionContributions(): PensionContribution[] {
  const csvPath = path.join(process.cwd(), "src/data/pension_contributions.csv");
  const raw = fs.readFileSync(csvPath, "utf-8");
  const lines = raw.trim().split("\n").slice(1); // skip header

  return lines
    .map((line) => {
      const cols = line.split(",").map((s) => s.trim());
      const [, dateStr, , grossStr] = cols;
      const gross = parseFloat(grossStr);
      const [day, month, year] = dateStr.split("/").map(Number);
      const date = new Date(year, month - 1, day);
      return {
        date,
        isoDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        grossGBP: gross,
        employeeGBP: gross * EMPLOYEE_FRACTION,
        employerGBP: gross * (1 - EMPLOYEE_FRACTION),
      };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

// Fetch daily NAV prices from Morningstar for the pension fund
export async function fetchMorningstarPrices(
  startDate: string,
  endDate: string
): Promise<Record<string, number>> {
  const url =
    `https://tools.morningstar.co.uk/api/rest.svc/timeseries_price/${PENSION_MORNINGSTAR_TOKEN}` +
    `?id=${PENSION_MORNINGSTAR_ID}&currencyId=GBP&frequency=daily&startDate=${startDate}&endDate=${endDate}`;

  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) return {};
  const xml = await res.text();

  const priceMap: Record<string, number> = {};
  for (const [, date, value] of xml.matchAll(
    /<EndDate>([^<]+)<\/EndDate><Value>([^<]+)<\/Value>/g
  )) {
    priceMap[date] = parseFloat(value);
  }
  return priceMap;
}

// Look up price for a date, walking back up to 7 days to skip weekends/holidays
export function priceNearDate(
  priceMap: Record<string, number>,
  isoDate: string
): number {
  if (priceMap[isoDate]) return priceMap[isoDate];
  const [y, m, d] = isoDate.split("-").map(Number);
  const base = new Date(y, m - 1, d);
  for (let i = 1; i <= 7; i++) {
    const prev = new Date(base);
    prev.setDate(base.getDate() - i);
    const key = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-${String(prev.getDate()).padStart(2, "0")}`;
    if (priceMap[key]) return priceMap[key];
  }
  return 0;
}
