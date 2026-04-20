"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Area,
  AreaChart,
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
} from "recharts";
import type { Holding, Transaction } from "@/lib/parse-transactions";

const AddTransactionModal = dynamic(() => import("./add-transaction-modal"), { ssr: false });

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
  dbAvailable: boolean;
  dbEmpty: boolean;
}

// Refined palette — jewel tones with amber lead
const PALETTE = [
  "#F0A500", "#FF6B35", "#E8C547", "#4ECDC4",
  "#45B7D1", "#96CEB4", "#DDA0DD", "#98D8C8",
];

// Design tokens
const C = {
  bg:       "#080A0E",
  surface:  "#0D0F14",
  surfaceAlt: "#0A0C10",
  border:   "#1A1E28",
  borderDim: "#12151C",
  textPrimary: "#E8E2D6",    // warm off-white — readable
  textSecondary: "#A89A86",  // warm medium — readable
  textMuted: "#6E6254",      // visible muted
  textDim:   "#4E4840",      // dimmest, sparingly
  amber:    "#F0A500",
  amberDim: "#C4851A",
  amberFaint: "#2A1E08",
  green:    "#3DD68C",
  red:      "#F07070",
  sky:      "#45B7D1",
} as const;

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

function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`text-[9px] tracking-[0.2em] uppercase ${className}`}
      style={{ color: C.textMuted, fontFamily: "var(--font-mono)" }}
    >
      {children}
    </span>
  );
}

function TimelineTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const portfolioEntry = payload.find((p) => p.name === "portfolioValue");
  const investedEntry = payload.find((p) => p.name === "netInvested");
  const value = portfolioEntry?.value ?? 0;
  const invested = investedEntry?.value ?? 0;
  const gain = value - invested;
  return (
    <div
      className="px-3 py-2.5 text-xs space-y-1"
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        fontFamily: "var(--font-mono)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
      }}
    >
      <p style={{ color: C.amber }} className="mb-1.5 font-semibold">
        {label ? new Date(label).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : ""}
      </p>
      <p style={{ color: C.textPrimary }}>Value: <span className="font-semibold">{fmtUsd(value)}</span></p>
      <p style={{ color: C.textSecondary }}>Invested: {fmtUsd(invested)}</p>
      {value > 0 && (
        <p style={{ color: gain >= 0 ? C.green : C.red }} className="font-semibold">
          {gain >= 0 ? "+" : ""}{fmtUsd(gain)}
        </p>
      )}
    </div>
  );
}

function BarTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; name: string }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="px-3 py-2 text-xs"
      style={{ background: C.surface, border: `1px solid ${C.border}`, fontFamily: "var(--font-mono)" }}
    >
      <p style={{ color: C.textPrimary }}>{fmtUsd(payload[0].value)}</p>
    </div>
  );
}

type TabId = "overview" | "holdings" | "allocation" | "interest" | "history";

export default function PortfolioDashboard({ holdings, transactions, interestEarned, dbAvailable, dbEmpty }: Props) {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [txPage, setTxPage] = useState(0);
  const [chartTimeframe, setChartTimeframe] = useState<string>("MAX");
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);
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
      className="min-h-screen pb-12"
      style={{ background: C.bg, fontFamily: "var(--font-syne), sans-serif" }}
    >
      {/* Subtle dot-grid background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle, rgba(240,165,0,0.06) 1px, transparent 1px)`,
          backgroundSize: "32px 32px",
        }}
      />

      {/* Header */}
      <header
        className="sticky top-0 z-20 border-b"
        style={{
          background: `rgba(8,10,14,0.94)`,
          backdropFilter: "blur(14px)",
          borderColor: C.border,
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
              <h1
                className="text-sm font-bold tracking-widest uppercase"
                style={{ color: C.textPrimary }}
              >
                Portfolio
              </h1>
              {lastUpdated && (
                <p
                  className="text-[9px] tracking-widest uppercase"
                  style={{ color: C.textDim, fontFamily: "var(--font-mono)" }}
                >
                  {lastUpdated.toLocaleTimeString("en-US", { hour12: false })}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchPrices}
              className="text-xs tracking-widest uppercase transition-colors"
              style={{ color: C.textMuted, fontFamily: "var(--font-mono)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = C.amber)}
              onMouseLeave={(e) => (e.currentTarget.style.color = C.textMuted)}
            >
              ↻
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="px-3 py-1.5 text-xs tracking-widest uppercase font-semibold transition-colors"
              style={{
                fontFamily: "var(--font-mono)",
                background: C.amber,
                color: "#000",
              }}
            >
              + Add
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-5 relative z-10">

        {/* Hero block */}
        <div
          className="mb-5 p-5"
          style={{
            background: C.surfaceAlt,
            border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${C.amber}`,
          }}
        >
          <Label className="block mb-2">Net Portfolio Value</Label>
          <p
            className="text-4xl font-bold tracking-tight mb-1.5"
            style={{
              color: C.textPrimary,
              fontFamily: "var(--font-mono)",
              textShadow: loaded ? `0 0 50px rgba(240,165,0,0.12)` : "none",
            }}
          >
            {loaded ? fmtUsd(totalValue) : "———"}
          </p>
          {loaded && (
            <div className="flex items-center gap-3">
              <p
                className="text-sm font-semibold"
                style={{ fontFamily: "var(--font-mono)", color: weighted24h >= 0 ? C.green : C.red }}
              >
                {weighted24h >= 0 ? "▲" : "▼"} {Math.abs(weighted24h).toFixed(2)}%
              </p>
              <span style={{ color: C.textDim, fontFamily: "var(--font-mono)" }} className="text-xs">24h weighted</span>
            </div>
          )}
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-3 gap-px mb-5" style={{ background: C.border }}>
          {[
            { label: "Total Value", value: loaded ? fmtUsd(totalValue) : "—", color: C.textPrimary },
            { label: "Assets", value: loaded ? String(holdingsWithValue.length) : "—", color: C.amber },
            { label: "Yield", value: loaded ? fmtUsd(totalInterestUsd) : "—", color: C.green },
          ].map((stat) => (
            <div key={stat.label} className="px-3 py-3" style={{ background: C.surfaceAlt }}>
              <Label className="block mb-1">{stat.label}</Label>
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
        <div className="flex border-b mb-5" style={{ borderColor: C.border }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-3 py-2 text-xs tracking-widest uppercase transition-all"
              style={{
                fontFamily: "var(--font-mono)",
                color: activeTab === tab.id ? C.amber : C.textMuted,
                borderBottom: activeTab === tab.id ? `2px solid ${C.amber}` : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {activeTab === "overview" && (() => {
          const TIMEFRAMES = ["3D","1W","1M","3M","6M","1Y","3Y","MAX"] as const;
          const cutoffMs: Record<string, number> = {
            "3D":  3  * 24 * 60 * 60 * 1000,
            "1W":  7  * 24 * 60 * 60 * 1000,
            "1M":  30 * 24 * 60 * 60 * 1000,
            "3M":  90 * 24 * 60 * 60 * 1000,
            "6M":  180* 24 * 60 * 60 * 1000,
            "1Y":  365* 24 * 60 * 60 * 1000,
            "3Y":  3*365*24*60*60*1000,
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

          // Compute gain for the selected period
          const periodGain = filteredTimeline.length >= 2
            ? filteredTimeline[filteredTimeline.length - 1].portfolioValue - filteredTimeline[0].portfolioValue
            : 0;
          const periodGainPct = filteredTimeline.length >= 2 && filteredTimeline[0].portfolioValue > 0
            ? (periodGain / filteredTimeline[0].portfolioValue) * 100
            : 0;

          return (
            <div className="space-y-4">
              {/* Portfolio chart — hero element */}
              <div
                style={{
                  background: C.surfaceAlt,
                  border: `1px solid ${C.border}`,
                }}
              >
                {/* Chart header */}
                <div
                  className="px-4 pt-4 pb-3 border-b flex items-start justify-between"
                  style={{ borderColor: C.borderDim }}
                >
                  <div>
                    <Label className="block mb-1">Portfolio Value</Label>
                    {!tooShort && periodGain !== 0 && (
                      <p
                        className="text-sm font-semibold"
                        style={{ fontFamily: "var(--font-mono)", color: periodGain >= 0 ? C.green : C.red }}
                      >
                        {periodGain >= 0 ? "+" : ""}{fmtUsd(periodGain)}
                        <span
                          className="ml-2 text-xs font-normal"
                          style={{ color: periodGain >= 0 ? C.green : C.red, opacity: 0.7 }}
                        >
                          ({periodGainPct >= 0 ? "+" : ""}{periodGainPct.toFixed(1)}%)
                        </span>
                      </p>
                    )}
                  </div>
                  {/* Timeframe pills */}
                  <div className="flex gap-px">
                    {TIMEFRAMES.map((tf) => (
                      <button
                        key={tf}
                        onClick={() => setChartTimeframe(tf)}
                        className="px-2 py-0.5 text-[9px] tracking-wider uppercase transition-colors"
                        style={{
                          fontFamily: "var(--font-mono)",
                          background: chartTimeframe === tf ? C.amber : "transparent",
                          color: chartTimeframe === tf ? "#000" : C.textMuted,
                          border: `1px solid ${chartTimeframe === tf ? C.amber : C.border}`,
                        }}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chart body */}
                <div className="px-2 pt-3 pb-4">
                  {tooShort ? (
                    <div
                      className="flex items-center justify-center"
                      style={{ height: 260, color: C.textMuted, fontFamily: "var(--font-mono)", fontSize: 10 }}
                    >
                      {chartData.length === 0 ? "Loading…" : "No data for this timeframe"}
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={filteredTimeline} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gradPortfolio" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#F0A500" stopOpacity={0.3} />
                            <stop offset="60%" stopColor="#F0A500" stopOpacity={0.06} />
                            <stop offset="100%" stopColor="#F0A500" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.borderDim} vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: C.textMuted, fontSize: 9, fontFamily: "var(--font-mono)" }}
                          tickLine={false}
                          axisLine={{ stroke: C.border }}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tick={{ fill: C.textMuted, fontSize: 9, fontFamily: "var(--font-mono)" }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => fmtUsd(v, true)}
                        />
                        <Tooltip content={<TimelineTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="portfolioValue"
                          stroke={C.amber}
                          strokeWidth={2}
                          fill="url(#gradPortfolio)"
                          dot={false}
                          activeDot={{ r: 4, fill: C.amber, strokeWidth: 0 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="netInvested"
                          stroke={C.textMuted}
                          strokeWidth={1}
                          strokeDasharray="4 3"
                          dot={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Legend */}
                <div
                  className="flex gap-5 px-4 py-2.5 border-t"
                  style={{ borderColor: C.borderDim }}
                >
                  {[
                    { color: C.amber, label: "Portfolio Value", solid: true },
                    { color: C.textMuted, label: "Cost Basis", solid: false },
                  ].map((l) => (
                    <div key={l.label} className="flex items-center gap-2">
                      <div
                        style={{
                          width: 16,
                          height: 2,
                          background: l.solid ? l.color : "transparent",
                          borderTop: l.solid ? "none" : `2px dashed ${l.color}`,
                        }}
                      />
                      <Label>{l.label}</Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top holdings */}
              <div style={{ background: C.surfaceAlt, border: `1px solid ${C.border}` }}>
                <div
                  className="px-4 py-2.5 border-b"
                  style={{ borderColor: C.borderDim }}
                >
                  <Label>Top Holdings</Label>
                </div>
                {holdingsWithValue.slice(0, 5).map((h, i) => (
                  <div
                    key={h.currency}
                    className="flex items-center justify-between px-4 py-3 border-b last:border-b-0"
                    style={{ borderColor: C.borderDim }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="text-xs font-bold w-4 text-right"
                        style={{ color: C.textDim, fontFamily: "var(--font-mono)" }}
                      >
                        {i + 1}
                      </span>
                      <div
                        className="w-7 h-7 flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                        style={{
                          background: PALETTE[i % PALETTE.length] + "20",
                          color: PALETTE[i % PALETTE.length],
                          border: `1px solid ${PALETTE[i % PALETTE.length]}35`,
                        }}
                      >
                        {h.currency.slice(0, 2)}
                      </div>
                      <div>
                        <p
                          className="text-sm font-semibold"
                          style={{ color: C.textPrimary }}
                        >
                          {h.currency}
                        </p>
                        <p
                          className="text-[10px]"
                          style={{ color: C.textSecondary, fontFamily: "var(--font-mono)" }}
                        >
                          {fmtAmount(h.amount)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className="text-sm font-semibold"
                        style={{ color: C.textPrimary, fontFamily: "var(--font-mono)" }}
                      >
                        {loaded ? fmtUsd(h.value) : "—"}
                      </p>
                      {!h.isStable && prices[h.currency] && (
                        <p
                          className="text-[10px]"
                          style={{
                            color: h.change24h >= 0 ? C.green : C.red,
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
          <div className="space-y-px" style={{ background: C.border }}>
            {holdingsWithValue.map((h, i) => (
              <div
                key={h.currency}
                className="flex items-center justify-between px-4 py-3.5"
                style={{ background: C.surfaceAlt }}
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
                      <span className="text-sm font-semibold" style={{ color: C.textPrimary }}>{h.currency}</span>
                      {h.isStable && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 tracking-widest uppercase"
                          style={{ background: "#0A1A12", color: C.green, border: `1px solid #1A3020` }}
                        >
                          Stable
                        </span>
                      )}
                    </div>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: C.textSecondary, fontFamily: "var(--font-mono)" }}
                    >
                      {fmtAmount(Math.abs(h.amount))} · {prices[h.currency] ? fmtUsd(h.price) : "…"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className="text-sm font-semibold"
                    style={{ color: C.textPrimary, fontFamily: "var(--font-mono)" }}
                  >
                    {loaded ? fmtUsd(Math.abs(h.value)) : "—"}
                  </p>
                  {!h.isStable && prices[h.currency] && (
                    <p
                      className="text-[10px]"
                      style={{ color: h.change24h >= 0 ? C.green : C.red, fontFamily: "var(--font-mono)" }}
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
            <div style={{ background: C.surfaceAlt, border: `1px solid ${C.border}` }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: C.borderDim }}>
                <Label>Allocation by Value</Label>
              </div>
              <div className="p-4">
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
                        <Tooltip content={<BarTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 mt-4">
                      {pieData.map((d, i) => (
                        <div key={d.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 flex-shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                            <span className="text-xs" style={{ color: C.textPrimary }}>{d.name}</span>
                          </div>
                          <span
                            className="text-xs"
                            style={{ color: C.textSecondary, fontFamily: "var(--font-mono)" }}
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
                    style={{ color: C.textMuted, fontFamily: "var(--font-mono)" }}
                  >
                    Loading prices…
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── YIELD ── */}
        {activeTab === "interest" && (
          <div className="space-y-4">
            <div style={{ background: C.surfaceAlt, border: `1px solid ${C.border}` }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: C.borderDim }}>
                <Label>Total Yield Earned</Label>
              </div>
              <div className="p-4">
                <p
                  className="text-2xl font-bold mb-4"
                  style={{ color: C.green, fontFamily: "var(--font-mono)" }}
                >
                  {loaded ? fmtUsd(totalInterestUsd) : "—"}
                </p>
                {loaded && interestChartData.length > 0 && (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={interestChartData} margin={{ top: 0, right: 0, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.borderDim} vertical={false} />
                      <XAxis
                        dataKey="currency"
                        tick={{ fill: C.textSecondary, fontSize: 9, fontFamily: "var(--font-mono)" }}
                        tickLine={false}
                        axisLine={{ stroke: C.border }}
                      />
                      <YAxis
                        tick={{ fill: C.textSecondary, fontSize: 9, fontFamily: "var(--font-mono)" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => fmtUsd(v, true)}
                      />
                      <Tooltip content={<BarTooltip />} />
                      <Bar dataKey="usdValue" fill={C.green} radius={[2, 2, 0, 0]} opacity={0.85} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
            <div style={{ background: C.surfaceAlt, border: `1px solid ${C.border}` }}>
              <div className="px-4 py-2.5 border-b" style={{ borderColor: C.borderDim }}>
                <Label>By Asset</Label>
              </div>
              {Object.entries(interestEarned)
                .filter(([, amt]) => amt > 0)
                .sort(([ac, aa], [bc, ba]) => (ba * (prices[bc]?.usd ?? 0)) - (aa * (prices[ac]?.usd ?? 0)))
                .map(([currency, amount]) => (
                  <div
                    key={currency}
                    className="flex items-center justify-between px-4 py-3 border-b last:border-b-0"
                    style={{ borderColor: C.borderDim }}
                  >
                    <span className="text-sm font-semibold" style={{ color: C.textPrimary }}>{currency}</span>
                    <div className="text-right">
                      <p
                        className="text-sm"
                        style={{ color: C.textSecondary, fontFamily: "var(--font-mono)" }}
                      >
                        {fmtAmount(amount)}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: C.green, fontFamily: "var(--font-mono)" }}
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
            <div style={{ background: C.surfaceAlt, border: `1px solid ${C.border}` }}>
              {pageTx.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-start gap-3 px-4 py-3 border-b last:border-b-0"
                  style={{ borderColor: C.borderDim }}
                >
                  <TypeDot type={tx.type} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p
                          className="text-[10px] tracking-widest uppercase mb-0.5"
                          style={{ color: C.textMuted, fontFamily: "var(--font-mono)" }}
                        >
                          {tx.type}
                        </p>
                        <p className="text-sm font-medium truncate" style={{ color: C.textPrimary }}>
                          {tx.inputAmount < 0 ? (
                            <>
                              <span style={{ color: C.red }}>−{fmtAmount(Math.abs(tx.inputAmount))} {tx.inputCurrency}</span>
                              {tx.outputCurrency !== tx.inputCurrency && (
                                <span style={{ color: C.textMuted }}> → <span style={{ color: C.green }}>{fmtAmount(tx.outputAmount)} {tx.outputCurrency}</span></span>
                              )}
                            </>
                          ) : (
                            <span style={{ color: C.green }}>+{fmtAmount(tx.outputAmount)} {tx.outputCurrency}</span>
                          )}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p
                          className="text-sm font-medium"
                          style={{ color: C.amber, fontFamily: "var(--font-mono)" }}
                        >
                          {fmtUsd(tx.usdEquivalent)}
                        </p>
                        <p
                          className="text-[10px]"
                          style={{ color: C.textDim, fontFamily: "var(--font-mono)" }}
                        >
                          {tx.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-4 px-1">
              <button
                onClick={() => setTxPage((p) => Math.max(0, p - 1))}
                disabled={txPage === 0}
                className="text-xs tracking-widest uppercase transition-colors disabled:opacity-20"
                style={{ color: C.textSecondary, fontFamily: "var(--font-mono)" }}
              >
                ← Prev
              </button>
              <span className="text-xs" style={{ color: C.textMuted, fontFamily: "var(--font-mono)" }}>
                {txPage + 1} / {totalPages} · {transactions.length} txns
              </span>
              <button
                onClick={() => setTxPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={txPage === totalPages - 1}
                className="text-xs tracking-widest uppercase transition-colors disabled:opacity-20"
                style={{ color: C.textSecondary, fontFamily: "var(--font-mono)" }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Seed banner — shown when DB is reachable but not yet seeded */}
      {dbEmpty && !seeding && (
        <div
          className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-between px-5 py-3"
          style={{ background: C.amber, fontFamily: "var(--font-mono)" }}
        >
          <p className="text-xs font-semibold text-black">
            Database connected but empty — import your CSV data?
          </p>
          <button
            onClick={async () => {
              setSeeding(true);
              try {
                const r = await fetch("/api/transactions/seed", { method: "POST" });
                const j = await r.json();
                setSeedResult(`Imported ${j.inserted} transactions`);
                window.location.reload();
              } catch {
                setSeedResult("Seed failed");
                setSeeding(false);
              }
            }}
            className="ml-4 px-3 py-1 text-xs font-bold bg-black text-amber-400 tracking-widest uppercase"
          >
            Import CSV →
          </button>
        </div>
      )}

      {/* Seed status */}
      {(seeding || seedResult) && (
        <div
          className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-between px-5 py-3"
          style={{ background: C.surface, borderTop: `1px solid ${C.border}`, fontFamily: "var(--font-mono)" }}
        >
          <p className="text-xs" style={{ color: seeding ? C.textSecondary : C.green }}>
            {seeding ? "Importing transactions…" : seedResult}
          </p>
          {seedResult && (
            <button
              onClick={() => setSeedResult(null)}
              className="text-xs"
              style={{ color: C.textMuted }}
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Add Transaction modal */}
      {showModal && (
        <AddTransactionModal
          onClose={() => setShowModal(false)}
          dbAvailable={dbAvailable}
        />
      )}
    </div>
  );
}
