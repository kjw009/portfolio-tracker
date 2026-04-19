"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart,
  Area,
  Line,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  ComposedChart,
} from "recharts";
import type { Holding, Transaction } from "@/lib/parse-transactions";

interface PriceData {
  usd: number;
  usd_24h_change: number;
}

interface ChartPoint {
  date: string;
  timestamp: number;
  portfolioValue: number;
  netInvested: number;
}

interface Props {
  holdings: Holding[];
  transactions: Transaction[];
  interestEarned: Record<string, number>;
}

const PALETTE = [
  "#F0A500", "#FF6B35", "#E8C547", "#4ECDC4",
  "#45B7D1", "#96CEB4", "#DDA0DD", "#98D8C8",
];

function fmtUsd(n: number, compact = false) {
  if (compact && Math.abs(n) >= 1000) {
    return `$${(n / 1000).toFixed(1)}k`;
  }
  if (Math.abs(n) >= 10000) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtAmount(n: number) {
  const abs = Math.abs(n);
  if (abs < 0.0001) return n.toFixed(8);
  if (abs < 0.01) return n.toFixed(6);
  if (abs < 1) return n.toFixed(4);
  if (abs < 10000) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const TX_TYPE_COLORS: Record<string, string> = {
  Interest: "text-amber-400",
  "Fixed Term Interest": "text-amber-400",
  "Interest Additional": "text-amber-400",
  Exchange: "text-sky-400",
  "Exchange Credit": "text-sky-400",
  "Top up Crypto": "text-emerald-400",
  Withdrawal: "text-red-400",
  "Loan Withdrawal": "text-orange-400",
  "Manual Repayment": "text-red-400",
};

function TypeDot({ type }: { type: string }) {
  const cls = TX_TYPE_COLORS[type] ?? "text-zinc-500";
  return <span className={`inline-block w-1.5 h-1.5 rounded-full bg-current ${cls} mr-1.5 flex-shrink-0 mt-[5px]`} />;
}

// Custom tooltip for area chart
function TimelineTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const portfolioEntry = payload.find((p) => p.name === "portfolioValue");
  const investedEntry = payload.find((p) => p.name === "netInvested");
  const value = portfolioEntry?.value ?? 0;
  const invested = investedEntry?.value ?? 0;
  const gain = value - invested;
  return (
    <div className="bg-[#0F0F11] border border-[#2A2118] px-3 py-2 text-xs font-mono space-y-0.5">
      <p className="text-amber-300 mb-1">{label ? new Date(label).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : ""}</p>
      <p className="text-zinc-200">Value: {fmtUsd(value)}</p>
      <p className="text-zinc-500">Invested: {fmtUsd(invested)}</p>
      {value > 0 && <p style={{ color: gain >= 0 ? "#4ADE80" : "#F87171" }}>
        {gain >= 0 ? "+" : ""}{fmtUsd(gain)}
      </p>}
    </div>
  );
}

function PriceTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; name: string }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0F0F11] border border-[#2A2118] px-3 py-2 text-xs font-mono">
      {payload.map((p) => (
        <p key={p.name} className="text-zinc-200">
          {fmtUsd(p.value)}
        </p>
      ))}
    </div>
  );
}

type TabId = "overview" | "holdings" | "allocation" | "interest" | "history";

export default function PortfolioDashboard({ holdings, transactions, interestEarned }: Props) {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [txPage, setTxPage] = useState(0);
  const [chartTimeframe, setChartTimeframe] = useState<string>("MAX");
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const TX_PAGE_SIZE = 25;

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

  useEffect(() => {
    fetch("/api/historical-prices")
      .then((r) => r.ok ? r.json() : [])
      .then(setChartData)
      .catch(() => {});
  }, []);

  const holdingsWithValue = holdings
    .map((h) => ({
      ...h,
      price: prices[h.currency]?.usd ?? 0,
      change24h: prices[h.currency]?.usd_24h_change ?? 0,
      value: h.amount * (prices[h.currency]?.usd ?? 0),
    }))
    .filter((h) => Math.abs(h.value) >= 0.5 && !h.isLoan)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  const totalValue = holdingsWithValue.reduce((s, h) => s + h.value, 0);
  const netValue = totalValue;

  const totalInterestUsd = Object.entries(interestEarned).reduce((sum, [cur, amt]) => {
    return sum + amt * (prices[cur]?.usd ?? 0);
  }, 0);

  const weighted24h = holdingsWithValue
    .filter((h) => h.value > 0 && prices[h.currency])
    .reduce((sum, h) => sum + (h.change24h * h.value) / Math.max(totalValue, 1), 0);

  const loaded = Object.keys(prices).length > 0;

  const pieData = holdingsWithValue
    .filter((h) => h.value > 1)
    .slice(0, 8)
    .map((h) => ({ name: h.currency, value: h.value }));

  const interestChartData = Object.entries(interestEarned)
    .map(([cur, amt]) => ({ currency: cur, usdValue: amt * (prices[cur]?.usd ?? 0) }))
    .filter((d) => d.usdValue > 0.01)
    .sort((a, b) => b.usdValue - a.usdValue)
    .slice(0, 8);

  const sortedTx = [...transactions].sort((a, b) => b.date.getTime() - a.date.getTime());
  const pageTx = sortedTx.slice(txPage * TX_PAGE_SIZE, (txPage + 1) * TX_PAGE_SIZE);
  const totalPages = Math.ceil(transactions.length / TX_PAGE_SIZE);

  const TABS: { id: TabId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "holdings", label: "Holdings" },
    { id: "allocation", label: "Alloc" },
    { id: "interest", label: "Yield" },
    { id: "history", label: "History" },
  ];

  return (
    <div
      className="min-h-screen pb-10"
      style={{
        background: "#08090A",
        fontFamily: "var(--font-syne), sans-serif",
      }}
    >
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(240,165,0,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(240,165,0,0.03) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Header */}
      <header
        className="sticky top-0 z-20 border-b"
        style={{
          background: "rgba(8,9,10,0.92)",
          backdropFilter: "blur(12px)",
          borderColor: "#1E1A12",
        }}
      >
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-7 h-7 flex items-center justify-center text-xs font-bold"
              style={{
                background: "linear-gradient(135deg, #F0A500, #FF6B35)",
                color: "#000",
                fontFamily: "var(--font-mono)",
              }}
            >
              ₿
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-widest uppercase text-zinc-100">
                Portfolio
              </h1>
              {lastUpdated && (
                <p
                  className="text-[10px] tracking-widest uppercase"
                  style={{ color: "#5A5040", fontFamily: "var(--font-mono)" }}
                >
                  {lastUpdated.toLocaleTimeString("en-US", { hour12: false })}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={fetchPrices}
            className="text-xs tracking-widest uppercase transition-colors"
            style={{ color: "#8A7040", fontFamily: "var(--font-mono)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#F0A500")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#8A7040")}
          >
            ↻ Refresh
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-5 relative z-10">

        {/* Hero value block */}
        <div
          className="mb-5 p-5 border-l-2 border-t"
          style={{ borderColor: "#F0A500", borderTopColor: "#2A2118", background: "rgba(240,165,0,0.03)" }}
        >
          <p
            className="text-[10px] tracking-[0.2em] uppercase mb-2"
            style={{ color: "#6A5830", fontFamily: "var(--font-mono)" }}
          >
            Net Portfolio Value
          </p>
          <p
            className="text-4xl font-bold tracking-tight mb-1"
            style={{
              color: "#F5ECD0",
              fontFamily: "var(--font-mono)",
              textShadow: loaded ? "0 0 40px rgba(240,165,0,0.15)" : "none",
            }}
          >
            {loaded ? fmtUsd(netValue) : "———"}
          </p>
          {loaded && (
            <p
              className="text-sm"
              style={{ fontFamily: "var(--font-mono)", color: weighted24h >= 0 ? "#4ADE80" : "#F87171" }}
            >
              {weighted24h >= 0 ? "▲" : "▼"} {Math.abs(weighted24h).toFixed(2)}%
              <span style={{ color: "#4A4030" }} className="ml-2 text-xs">24h weighted</span>
            </p>
          )}
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-3 gap-px mb-5" style={{ background: "#1A1510" }}>
          {[
            { label: "Holdings", value: loaded ? fmtUsd(totalValue) : "—", color: "#F5ECD0" },
            { label: "Assets", value: loaded ? String(holdingsWithValue.length) : "—", color: "#F0A500" },
            { label: "Yield", value: loaded ? fmtUsd(totalInterestUsd) : "—", color: "#4ADE80" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="px-3 py-3"
              style={{ background: "#0A0B0C" }}
            >
              <p
                className="text-[9px] tracking-[0.18em] uppercase mb-1"
                style={{ color: "#4A4030", fontFamily: "var(--font-mono)" }}
              >
                {stat.label}
              </p>
              <p
                className="text-sm font-semibold truncate"
                style={{ color: stat.color, fontFamily: "var(--font-mono)" }}
              >
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* Tab nav */}
        <div
          className="flex border-b mb-5 gap-0"
          style={{ borderColor: "#1A1510" }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-3 py-2 text-xs tracking-widest uppercase transition-all relative"
              style={{
                fontFamily: "var(--font-mono)",
                color: activeTab === tab.id ? "#F0A500" : "#4A4030",
                borderBottom: activeTab === tab.id ? "2px solid #F0A500" : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {activeTab === "overview" && (() => {
          const TIMEFRAMES = ["1M","3M","6M","1Y","3Y","MAX"] as const;
          const cutoffMs: Record<string, number> = {
            "1M":  30 * 24 * 60 * 60 * 1000,
            "3M":  90 * 24 * 60 * 60 * 1000,
            "6M":  180 * 24 * 60 * 60 * 1000,
            "1Y":  365 * 24 * 60 * 60 * 1000,
            "3Y":  3 * 365 * 24 * 60 * 60 * 1000,
          };
          const now = Date.now();
          const filteredTimeline = chartTimeframe === "MAX"
            ? chartData
            : (() => {
                const cutoff = now - cutoffMs[chartTimeframe];
                const filtered = chartData.filter((p) => p.timestamp >= cutoff);
                return filtered.length >= 2 ? filtered : chartData.slice(-Math.max(2, filtered.length));
              })();
          const tooShort = filteredTimeline.length < 2 || chartData.length === 0;

          return (
          <div className="space-y-4">
            {/* Timeline chart */}
            <div className="border p-4" style={{ borderColor: "#1E1A12", background: "#0A0B0C" }}>
              <div className="flex items-center justify-between mb-3">
                <p
                  className="text-[10px] tracking-[0.2em] uppercase"
                  style={{ color: "#6A5830", fontFamily: "var(--font-mono)" }}
                >
                  Portfolio Value Over Time
                </p>
              </div>
              {/* Timeframe selector */}
              <div className="flex gap-px mb-4 overflow-x-auto">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setChartTimeframe(tf)}
                    className="flex-shrink-0 px-2.5 py-1 text-[9px] tracking-widest uppercase transition-colors"
                    style={{
                      fontFamily: "var(--font-mono)",
                      background: chartTimeframe === tf ? "#F0A500" : "#12110E",
                      color: chartTimeframe === tf ? "#0A0B0C" : "#4A4030",
                      border: `1px solid ${chartTimeframe === tf ? "#F0A500" : "#1E1A12"}`,
                    }}
                  >
                    {tf}
                  </button>
                ))}
              </div>
              {tooShort ? (
                <div
                  className="flex items-center justify-center h-[200px] text-[10px] tracking-widest uppercase"
                  style={{ color: "#4A4030", fontFamily: "var(--font-mono)" }}
                >
                  {chartData.length === 0 ? "Loading…" : "No data for this timeframe"}
                </div>
              ) : (
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={filteredTimeline} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradPortfolio" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F0A500" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#F0A500" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1A1510" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#4A4030", fontSize: 9, fontFamily: "var(--font-mono)" }}
                    tickLine={false}
                    axisLine={{ stroke: "#1A1510" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: "#4A4030", fontSize: 9, fontFamily: "var(--font-mono)" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => fmtUsd(v, true)}
                  />
                  <Tooltip content={<TimelineTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="portfolioValue"
                    stroke="#F0A500"
                    strokeWidth={2}
                    fill="url(#gradPortfolio)"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="netInvested"
                    stroke="#4A4030"
                    strokeWidth={1}
                    strokeDasharray="4 3"
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              )}
              <div className="flex gap-4 mt-3">
                {[
                  { color: "#F0A500", label: "Portfolio Value" },
                  { color: "#4A4030", label: "Cost Basis" },
                ].map((l) => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className="w-2 h-px" style={{ background: l.color, height: "2px", width: "12px" }} />
                    <span
                      className="text-[10px] tracking-widest uppercase"
                      style={{ color: "#6A5830", fontFamily: "var(--font-mono)" }}
                    >
                      {l.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top holdings preview */}
            <div className="border" style={{ borderColor: "#1E1A12", background: "#0A0B0C" }}>
              <div
                className="px-4 py-2 border-b text-[10px] tracking-[0.2em] uppercase"
                style={{ borderColor: "#1E1A12", color: "#6A5830", fontFamily: "var(--font-mono)" }}
              >
                Top Holdings
              </div>
              {holdingsWithValue.slice(0, 5).map((h, i) => (
                <div
                  key={h.currency}
                  className="flex items-center justify-between px-4 py-3 border-b last:border-b-0"
                  style={{ borderColor: "#12110E" }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="text-xs font-bold w-4"
                      style={{ color: "#3A3020", fontFamily: "var(--font-mono)" }}
                    >
                      {i + 1}
                    </span>
                    <div
                      className="w-6 h-6 flex items-center justify-center text-[10px] font-bold"
                      style={{
                        background: PALETTE[i % PALETTE.length] + "22",
                        color: PALETTE[i % PALETTE.length],
                        border: `1px solid ${PALETTE[i % PALETTE.length]}33`,
                      }}
                    >
                      {h.currency.slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">{h.currency}</p>
                      <p className="text-[10px]" style={{ color: "#5A5040", fontFamily: "var(--font-mono)" }}>
                        {fmtAmount(h.amount)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className="text-sm font-semibold"
                      style={{ color: "#F5ECD0", fontFamily: "var(--font-mono)" }}
                    >
                      {loaded ? fmtUsd(h.value) : "—"}
                    </p>
                    {!h.isStable && prices[h.currency] && (
                      <p
                        className="text-[10px]"
                        style={{
                          color: h.change24h >= 0 ? "#4ADE80" : "#F87171",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {h.change24h >= 0 ? "▲" : "▼"}{Math.abs(h.change24h).toFixed(2)}%
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          );
        })()}

        {/* ── HOLDINGS ── */}
        {activeTab === "holdings" && (
          <div className="space-y-px" style={{ background: "#1A1510" }}>
            {holdingsWithValue.map((h, i) => (
              <div
                key={h.currency}
                className="flex items-center justify-between px-4 py-3.5"
                style={{ background: "#0A0B0C" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{
                      background: PALETTE[i % PALETTE.length] + "18",
                      color: PALETTE[i % PALETTE.length],
                      border: `1px solid ${PALETTE[i % PALETTE.length]}30`,
                    }}
                  >
                    {h.currency.slice(0, 3)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-100">{h.currency}</span>
                      {h.isStable && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 tracking-widest uppercase"
                          style={{ background: "#0A1A12", color: "#4ADE80", border: "1px solid #1A3020" }}
                        >
                          Stable
                        </span>
                      )}
                    </div>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: "#5A5040", fontFamily: "var(--font-mono)" }}
                    >
                      {fmtAmount(Math.abs(h.amount))} · {prices[h.currency] ? fmtUsd(h.price) : "…"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className="text-sm font-semibold"
                    style={{
                      color: "#F5ECD0",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {loaded ? fmtUsd(Math.abs(h.value)) : "—"}
                  </p>
                  {!h.isStable && prices[h.currency] && (
                    <p
                      className="text-[10px]"
                      style={{
                        color: h.change24h >= 0 ? "#4ADE80" : "#F87171",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {h.change24h >= 0 ? "▲" : "▼"}{Math.abs(h.change24h).toFixed(2)}%
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── ALLOCATION ── */}
        {activeTab === "allocation" && (
          <div className="space-y-4">
            <div className="border p-4" style={{ borderColor: "#1E1A12", background: "#0A0B0C" }}>
              <p
                className="text-[10px] tracking-[0.2em] uppercase mb-4"
                style={{ color: "#6A5830", fontFamily: "var(--font-mono)" }}
              >
                Allocation by Value
              </p>
              {loaded && pieData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="transparent" />
                        ))}
                      </Pie>
                      <Tooltip content={<PriceTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 mt-3">
                    {pieData.map((d, i) => (
                      <div key={d.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 flex-shrink-0"
                            style={{ background: PALETTE[i % PALETTE.length] }}
                          />
                          <span className="text-xs text-zinc-300">{d.name}</span>
                        </div>
                        <span
                          className="text-xs"
                          style={{ color: "#8A7040", fontFamily: "var(--font-mono)" }}
                        >
                          {((d.value / totalValue) * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div
                  className="h-40 flex items-center justify-center text-xs tracking-widest uppercase"
                  style={{ color: "#3A3020", fontFamily: "var(--font-mono)" }}
                >
                  Loading prices…
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── YIELD ── */}
        {activeTab === "interest" && (
          <div className="space-y-4">
            <div className="border p-4" style={{ borderColor: "#1E1A12", background: "#0A0B0C" }}>
              <p
                className="text-[10px] tracking-[0.2em] uppercase mb-1"
                style={{ color: "#6A5830", fontFamily: "var(--font-mono)" }}
              >
                Total Yield Earned
              </p>
              <p
                className="text-2xl font-bold mb-4"
                style={{ color: "#4ADE80", fontFamily: "var(--font-mono)" }}
              >
                {loaded ? fmtUsd(totalInterestUsd) : "—"}
              </p>
              {loaded && interestChartData.length > 0 && (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={interestChartData} margin={{ top: 0, right: 0, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1A1510" vertical={false} />
                    <XAxis
                      dataKey="currency"
                      tick={{ fill: "#5A5040", fontSize: 9, fontFamily: "var(--font-mono)" }}
                      tickLine={false}
                      axisLine={{ stroke: "#1A1510" }}
                    />
                    <YAxis
                      tick={{ fill: "#5A5040", fontSize: 9, fontFamily: "var(--font-mono)" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => fmtUsd(v, true)}
                    />
                    <Tooltip content={<PriceTooltip />} />
                    <Bar dataKey="usdValue" fill="#4ADE80" radius={[2, 2, 0, 0]} opacity={0.8} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="border" style={{ borderColor: "#1E1A12", background: "#0A0B0C" }}>
              <div
                className="px-4 py-2 border-b text-[10px] tracking-[0.2em] uppercase"
                style={{ borderColor: "#1E1A12", color: "#6A5830", fontFamily: "var(--font-mono)" }}
              >
                By Asset
              </div>
              {Object.entries(interestEarned)
                .filter(([, amt]) => amt > 0)
                .sort(([ac, aa], [bc, ba]) => (ba * (prices[bc]?.usd ?? 0)) - (aa * (prices[ac]?.usd ?? 0)))
                .map(([currency, amount]) => (
                  <div
                    key={currency}
                    className="flex items-center justify-between px-4 py-3 border-b last:border-b-0"
                    style={{ borderColor: "#12110E" }}
                  >
                    <span className="text-sm font-semibold text-zinc-200">{currency}</span>
                    <div className="text-right">
                      <p
                        className="text-sm"
                        style={{ color: "#A09070", fontFamily: "var(--font-mono)" }}
                      >
                        {fmtAmount(amount)}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "#4ADE80", fontFamily: "var(--font-mono)" }}
                      >
                        {prices[currency] ? fmtUsd(amount * prices[currency].usd) : "—"}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ── HISTORY ── */}
        {activeTab === "history" && (
          <div>
            <div className="border" style={{ borderColor: "#1E1A12", background: "#0A0B0C" }}>
              {pageTx.map((tx, i) => (
                <div
                  key={tx.id}
                  className="flex items-start gap-3 px-4 py-3 border-b last:border-b-0"
                  style={{ borderColor: "#12110E" }}
                >
                  <TypeDot type={tx.type} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p
                          className="text-[10px] tracking-widest uppercase mb-0.5"
                          style={{ color: "#5A5040", fontFamily: "var(--font-mono)" }}
                        >
                          {tx.type}
                        </p>
                        <p className="text-sm text-zinc-200 font-medium truncate">
                          {tx.inputAmount < 0 ? (
                            <>
                              <span style={{ color: "#F87171" }}>−{fmtAmount(Math.abs(tx.inputAmount))} {tx.inputCurrency}</span>
                              {tx.outputCurrency !== tx.inputCurrency && (
                                <span style={{ color: "#5A5040" }}> → <span style={{ color: "#4ADE80" }}>{fmtAmount(tx.outputAmount)} {tx.outputCurrency}</span></span>
                              )}
                            </>
                          ) : (
                            <span style={{ color: "#4ADE80" }}>+{fmtAmount(tx.outputAmount)} {tx.outputCurrency}</span>
                          )}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p
                          className="text-sm font-medium"
                          style={{ color: "#F0A500", fontFamily: "var(--font-mono)" }}
                        >
                          {fmtUsd(tx.usdEquivalent)}
                        </p>
                        <p
                          className="text-[10px]"
                          style={{ color: "#3A3020", fontFamily: "var(--font-mono)" }}
                        >
                          {tx.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 px-1">
              <button
                onClick={() => setTxPage((p) => Math.max(0, p - 1))}
                disabled={txPage === 0}
                className="text-xs tracking-widest uppercase transition-colors disabled:opacity-20"
                style={{ color: "#8A7040", fontFamily: "var(--font-mono)" }}
              >
                ← Prev
              </button>
              <span
                className="text-xs"
                style={{ color: "#3A3020", fontFamily: "var(--font-mono)" }}
              >
                {txPage + 1} / {totalPages} · {transactions.length} txns
              </span>
              <button
                onClick={() => setTxPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={txPage === totalPages - 1}
                className="text-xs tracking-widest uppercase transition-colors disabled:opacity-20"
                style={{ color: "#8A7040", fontFamily: "var(--font-mono)" }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
