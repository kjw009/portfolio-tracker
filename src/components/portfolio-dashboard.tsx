"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from "recharts";
import type { Holding, Transaction } from "@/lib/parse-transactions";

interface PriceData {
  usd: number;
  usd_24h_change: number;
}

interface Props {
  holdings: Holding[];
  transactions: Transaction[];
  interestEarned: Record<string, number>;
}

const COLORS = [
  "#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd",
  "#06b6d4", "#0891b2", "#0284c7", "#2563eb",
  "#10b981", "#059669", "#f59e0b", "#ef4444",
];

const CURRENCY_SYMBOLS: Record<string, string> = {
  BTC: "₿", ETH: "Ξ", XRP: "✕", NEXO: "N",
  USDT: "$", FLR: "🔥", LINK: "⬡", ENJ: "Ω",
  AXS: "A", GALA: "G", GBPX: "£", xUSD: "$",
};

function fmt(n: number, decimals = 2) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

function fmtUsd(n: number) {
  if (Math.abs(n) >= 1000) return `$${fmt(n, 0)}`;
  return `$${fmt(n, 2)}`;
}

function fmtAmount(amount: number) {
  if (Math.abs(amount) < 0.01) return amount.toFixed(6);
  if (Math.abs(amount) < 1) return amount.toFixed(4);
  if (Math.abs(amount) < 1000) return fmt(amount, 2);
  return fmt(amount, 0);
}

function Change({ pct }: { pct: number }) {
  const positive = pct >= 0;
  return (
    <span className={positive ? "text-emerald-400" : "text-red-400"}>
      {positive ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
    </span>
  );
}

export default function PortfolioDashboard({ holdings, transactions, interestEarned }: Props) {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [txPage, setTxPage] = useState(0);
  const TX_PAGE_SIZE = 20;

  const fetchPrices = useCallback(async () => {
    const currencies = [...new Set(holdings.map((h) => h.currency))].join(",");
    const res = await fetch(`/api/prices?currencies=${currencies}`);
    if (res.ok) {
      setPrices(await res.json());
      setLastUpdated(new Date());
    }
  }, [holdings]);

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 60_000);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  // Compute values
  const holdingsWithValue = holdings
    .map((h) => ({
      ...h,
      price: prices[h.currency]?.usd ?? 0,
      change24h: prices[h.currency]?.usd_24h_change ?? 0,
      value: h.amount * (prices[h.currency]?.usd ?? 0),
    }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  const totalValue = holdingsWithValue
    .filter((h) => !h.isLoan)
    .reduce((s, h) => s + h.value, 0);

  const totalDebt = holdingsWithValue
    .filter((h) => h.isLoan)
    .reduce((s, h) => s + Math.abs(h.value), 0);

  const netValue = totalValue - totalDebt;

  const totalInterestUsd = Object.entries(interestEarned).reduce((sum, [cur, amt]) => {
    return sum + amt * (prices[cur]?.usd ?? 0);
  }, 0);

  const weighted24hChange = holdingsWithValue
    .filter((h) => !h.isLoan && h.value > 0 && prices[h.currency])
    .reduce((sum, h) => sum + (h.change24h * h.value) / totalValue, 0);

  // Pie chart data (top assets by value)
  const pieData = holdingsWithValue
    .filter((h) => !h.isLoan && h.value > 1)
    .slice(0, 8)
    .map((h) => ({ name: h.currency, value: h.value }));

  // Interest bar chart (top earners by current value)
  const interestChartData = Object.entries(interestEarned)
    .map(([cur, amt]) => ({
      currency: cur,
      usdValue: amt * (prices[cur]?.usd ?? 0),
    }))
    .filter((d) => d.usdValue > 0.01)
    .sort((a, b) => b.usdValue - a.usdValue)
    .slice(0, 8);

  const sortedTx = [...transactions].sort((a, b) => b.date.getTime() - a.date.getTime());
  const pageTx = sortedTx.slice(txPage * TX_PAGE_SIZE, (txPage + 1) * TX_PAGE_SIZE);
  const totalPages = Math.ceil(transactions.length / TX_PAGE_SIZE);

  const loaded = Object.keys(prices).length > 0;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-950/90 backdrop-blur border-b border-gray-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Portfolio</h1>
            {lastUpdated && (
              <p className="text-xs text-gray-500">
                Updated {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>
          <button
            onClick={fetchPrices}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Refresh ↻
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-gray-900 border-gray-800 col-span-2">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-gray-400 mb-1">Net Portfolio Value</p>
              <p className="text-3xl font-bold tracking-tight">
                {loaded ? fmtUsd(netValue) : "—"}
              </p>
              {loaded && (
                <p className="text-sm mt-1">
                  <Change pct={weighted24hChange} />
                  <span className="text-gray-500 ml-2">24h</span>
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-gray-400 mb-1">Holdings</p>
              <p className="text-xl font-semibold">{loaded ? fmtUsd(totalValue) : "—"}</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-gray-400 mb-1">Loan Outstanding</p>
              <p className="text-xl font-semibold text-red-400">
                {loaded ? fmtUsd(totalDebt) : "—"}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800 col-span-2">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-gray-400 mb-1">Interest Earned (current price)</p>
              <p className="text-xl font-semibold text-emerald-400">
                {loaded ? fmtUsd(totalInterestUsd) : "—"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="holdings">
          <TabsList className="w-full bg-gray-900 border border-gray-800">
            <TabsTrigger value="holdings" className="flex-1 data-[state=active]:bg-gray-800">
              Holdings
            </TabsTrigger>
            <TabsTrigger value="chart" className="flex-1 data-[state=active]:bg-gray-800">
              Allocation
            </TabsTrigger>
            <TabsTrigger value="interest" className="flex-1 data-[state=active]:bg-gray-800">
              Interest
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1 data-[state=active]:bg-gray-800">
              History
            </TabsTrigger>
          </TabsList>

          {/* Holdings Tab */}
          <TabsContent value="holdings" className="space-y-2 mt-3">
            {holdingsWithValue.map((h, i) => (
              <Card
                key={h.currency}
                className={`border-gray-800 ${h.isLoan ? "bg-red-950/30" : "bg-gray-900"}`}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ backgroundColor: COLORS[i % COLORS.length] + "33", color: COLORS[i % COLORS.length] }}
                      >
                        {CURRENCY_SYMBOLS[h.currency] || h.currency.slice(0, 2)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{h.currency}</span>
                          {h.isLoan && <Badge variant="destructive" className="text-xs py-0">Loan</Badge>}
                          {h.isStable && !h.isLoan && <Badge variant="secondary" className="text-xs py-0">Stable</Badge>}
                        </div>
                        <p className="text-xs text-gray-400">
                          {fmtAmount(Math.abs(h.amount))} @ {prices[h.currency] ? fmtUsd(h.price) : "…"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${h.isLoan ? "text-red-400" : ""}`}>
                        {loaded ? fmtUsd(Math.abs(h.value)) : "—"}
                      </p>
                      {!h.isStable && prices[h.currency] && (
                        <p className="text-xs">
                          <Change pct={h.change24h} />
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Allocation Chart */}
          <TabsContent value="chart" className="mt-3">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-300">Allocation by Value</CardTitle>
              </CardHeader>
              <CardContent>
                {loaded && pieData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {pieData.map((_, index) => (
                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val) => [fmtUsd(Number(val)), "Value"]}
                          contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }}
                          labelStyle={{ color: "#f9fafb" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="grid grid-cols-2 gap-1 mt-2">
                      {pieData.map((d, i) => (
                        <div key={d.name} className="flex items-center gap-2 text-xs">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: COLORS[i % COLORS.length] }}
                          />
                          <span className="text-gray-300">{d.name}</span>
                          <span className="text-gray-500 ml-auto">
                            {((d.value / totalValue) * 100).toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="h-40 flex items-center justify-center text-gray-500 text-sm">
                    Loading prices…
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Interest Tab */}
          <TabsContent value="interest" className="mt-3 space-y-3">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-300">Interest Earned by Asset</CardTitle>
              </CardHeader>
              <CardContent>
                {loaded && interestChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={interestChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <XAxis dataKey="currency" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                      <Tooltip
                        formatter={(val) => [fmtUsd(Number(val)), "Interest Value"]}
                        contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }}
                        labelStyle={{ color: "#f9fafb" }}
                      />
                      <Bar dataKey="usdValue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-40 flex items-center justify-center text-gray-500 text-sm">
                    Loading…
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-300">Interest Detail</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(interestEarned)
                  .filter(([, amt]) => amt > 0)
                  .sort(([ac, aa], [bc, ba]) => (ba * (prices[bc]?.usd ?? 0)) - (aa * (prices[ac]?.usd ?? 0)))
                  .map(([currency, amount]) => (
                    <div key={currency} className="flex items-center justify-between text-sm">
                      <span className="font-medium">{currency}</span>
                      <div className="text-right">
                        <p className="text-gray-200">{fmtAmount(amount)} {currency}</p>
                        <p className="text-xs text-emerald-400">
                          {prices[currency] ? fmtUsd(amount * prices[currency].usd) : "—"}
                        </p>
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transaction History */}
          <TabsContent value="history" className="mt-3 space-y-2">
            {pageTx.map((tx) => (
              <Card key={tx.id} className="bg-gray-900 border-gray-800">
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className="text-xs border-gray-700 text-gray-300 whitespace-nowrap"
                        >
                          {tx.type}
                        </Badge>
                        <span className="text-xs text-gray-400">
                          {tx.date.toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                      <p className="text-sm mt-1 text-gray-200">
                        {tx.inputAmount < 0 ? (
                          <span>
                            <span className="text-red-400">{fmtAmount(Math.abs(tx.inputAmount))} {tx.inputCurrency}</span>
                            {tx.outputCurrency !== tx.inputCurrency && (
                              <span className="text-gray-400"> → <span className="text-emerald-400">{fmtAmount(tx.outputAmount)} {tx.outputCurrency}</span></span>
                            )}
                          </span>
                        ) : (
                          <span className="text-emerald-400">
                            +{fmtAmount(tx.outputAmount)} {tx.outputCurrency}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-medium text-gray-200">{fmtUsd(tx.usdEquivalent)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Pagination */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setTxPage((p) => Math.max(0, p - 1))}
                disabled={txPage === 0}
                className="text-sm text-indigo-400 disabled:text-gray-700 hover:text-indigo-300 transition-colors"
              >
                ← Prev
              </button>
              <span className="text-xs text-gray-500">
                {txPage + 1} / {totalPages}
              </span>
              <button
                onClick={() => setTxPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={txPage === totalPages - 1}
                className="text-sm text-indigo-400 disabled:text-gray-700 hover:text-indigo-300 transition-colors"
              >
                Next →
              </button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
