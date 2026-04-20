import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    const rows = await db.select().from(transactions).orderBy(asc(transactions.date));
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      type,
      assetType = "crypto",
      inputCurrency,
      inputAmount,
      outputCurrency,
      outputAmount,
      usdEquivalent,
      details = "",
      date,
    } = body;

    if (!type || !inputCurrency || !outputCurrency || date === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const db = getDb();
    const [row] = await db
      .insert(transactions)
      .values({
        id: randomUUID(),
        type,
        assetType,
        inputCurrency,
        inputAmount: String(inputAmount ?? 0),
        outputCurrency,
        outputAmount: String(outputAmount ?? 0),
        usdEquivalent: String(usdEquivalent ?? 0),
        details,
        date: new Date(date),
        source: "manual",
      })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
