import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import {
  parsePensionContributions,
  fetchMorningstarPrices,
  priceNearDate,
  PENSION_TICKER,
  PENSION_FUND_NAME,
} from "@/lib/parse-pension";

export const dynamic = "force-dynamic";

// POST /api/pension/seed
// Reads pension_contributions.csv, looks up the fund NAV at each contribution date
// (to convert GBP → units), and inserts into the transactions DB.
// Only the employee portion (3/8) is stored as usdEquivalent, so cost-basis is correct.
export async function POST() {
  try {
    const db = getDb();
    const contributions = parsePensionContributions();

    // Fetch current GBP/USD rate
    const fxRes = await fetch("https://api.exchangerate-api.com/v4/latest/GBP");
    const gbpUsd: number = fxRes.ok
      ? ((await fxRes.json()).rates?.USD ?? 1.3)
      : 1.3;

    // Fetch all Morningstar NAV prices covering the contribution date range
    const startDate = contributions[0].isoDate;
    const endDate = contributions[contributions.length - 1].isoDate;
    const priceMap = await fetchMorningstarPrices(startDate, endDate);

    let inserted = 0;
    let skipped = 0;
    const details: { date: string; navGBP: number; units: number }[] = [];

    for (const [i, c] of contributions.entries()) {
      const navGBP = priceNearDate(priceMap, c.isoDate);
      // Units = full contribution ÷ NAV (employer + employee units both held)
      const units = navGBP > 0 ? c.grossGBP / navGBP : c.grossGBP;

      // Cost basis = employee portion only, converted to USD at current rate
      const employeeCostUSD = c.employeeGBP * gbpUsd;

      const result = await db
        .insert(transactions)
        .values({
          id: `PENSION-${c.isoDate}-${i}`,
          type: "Buy",
          assetType: "pension",
          inputCurrency: "GBP",
          inputAmount: String(-c.grossGBP),
          outputCurrency: PENSION_TICKER,
          outputAmount: String(units),
          usdEquivalent: String(employeeCostUSD),
          details: `${PENSION_FUND_NAME} | Employee: £${c.employeeGBP.toFixed(2)} | Employer: £${c.employerGBP.toFixed(2)} | NAV: £${navGBP.toFixed(4)}`,
          date: c.date,
          source: "csv",
        })
        .onConflictDoNothing()
        .returning({ id: transactions.id });

      if (result.length > 0) {
        inserted++;
        details.push({ date: c.isoDate, navGBP, units });
      } else {
        skipped++;
      }
    }

    return NextResponse.json({
      inserted,
      skipped,
      total: contributions.length,
      gbpUsd,
      navPricesFound: Object.keys(priceMap).length,
      sample: details.slice(0, 3),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
