"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type TxType = "Buy" | "Sell" | "Trade" | "Income";
type AssetType = "crypto" | "stock" | "etf" | "real_estate" | "jewelry" | "commodity" | "other";

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  crypto: "Crypto",
  stock: "Stock",
  etf: "ETF",
  real_estate: "Real Estate",
  jewelry: "Jewelry",
  commodity: "Commodity",
  other: "Other",
};

const C = {
  bg:          "#080A0E",
  surface:     "#0D0F14",
  surfaceAlt:  "#0A0C10",
  border:      "#1A1E28",
  borderDim:   "#12151C",
  textPrimary: "#E8E2D6",
  textSecondary: "#A89A86",
  textMuted:   "#6E6254",
  amber:       "#F0A500",
  green:       "#3DD68C",
  red:         "#F07070",
} as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label
        className="block text-[9px] tracking-[0.2em] uppercase"
        style={{ color: C.textMuted, fontFamily: "var(--font-mono)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  background: C.bg,
  border: `1px solid ${C.border}`,
  color: C.textPrimary,
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  padding: "8px 10px",
  width: "100%",
  outline: "none",
} as const;

const selectStyle = {
  ...inputStyle,
  cursor: "pointer",
  appearance: "none" as const,
} as const;

interface Props {
  onClose: () => void;
  dbAvailable: boolean;
}

export default function AddTransactionModal({ onClose, dbAvailable }: Props) {
  const router = useRouter();
  const [txType, setTxType] = useState<TxType>("Buy");
  const [assetType, setAssetType] = useState<AssetType>("crypto");
  const [symbol, setSymbol] = useState("");
  const [quantity, setQuantity] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [fromSymbol, setFromSymbol] = useState("");
  const [fromQty, setFromQty] = useState("");
  const [toSymbol, setToSymbol] = useState("");
  const [toQty, setToQty] = useState("");
  const [usdValue, setUsdValue] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const computedUsd = txType !== "Trade" && quantity && pricePerUnit
    ? (parseFloat(quantity) * parseFloat(pricePerUnit)).toFixed(2)
    : usdValue;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const qty = parseFloat(quantity) || 0;
      const price = parseFloat(pricePerUnit) || 0;
      const totalUsd = txType === "Trade"
        ? parseFloat(usdValue) || 0
        : qty * price || parseFloat(usdValue) || 0;

      let body: Record<string, unknown>;

      if (txType === "Buy") {
        body = {
          type: "Buy",
          assetType,
          inputCurrency: "USD",
          inputAmount: -(totalUsd),
          outputCurrency: symbol.trim().toUpperCase(),
          outputAmount: qty,
          usdEquivalent: totalUsd,
          details: notes,
          date: new Date(date).toISOString(),
        };
      } else if (txType === "Sell") {
        body = {
          type: "Sell",
          assetType,
          inputCurrency: symbol.trim().toUpperCase(),
          inputAmount: -(qty),
          outputCurrency: "USD",
          outputAmount: totalUsd,
          usdEquivalent: totalUsd,
          details: notes,
          date: new Date(date).toISOString(),
        };
      } else if (txType === "Trade") {
        body = {
          type: "Trade",
          assetType,
          inputCurrency: fromSymbol.trim().toUpperCase(),
          inputAmount: -(parseFloat(fromQty) || 0),
          outputCurrency: toSymbol.trim().toUpperCase(),
          outputAmount: parseFloat(toQty) || 0,
          usdEquivalent: parseFloat(usdValue) || 0,
          details: notes,
          date: new Date(date).toISOString(),
        };
      } else {
        // Income
        body = {
          type: "Income",
          assetType,
          inputCurrency: symbol.trim().toUpperCase(),
          inputAmount: qty,
          outputCurrency: symbol.trim().toUpperCase(),
          outputAmount: qty,
          usdEquivalent: totalUsd,
          details: notes,
          date: new Date(date).toISOString(),
        };
      }

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save transaction");
    } finally {
      setLoading(false);
    }
  }

  const TX_TYPES: TxType[] = ["Buy", "Sell", "Trade", "Income"];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto"
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderBottom: "none",
        }}
      >
        {/* Modal header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b sticky top-0"
          style={{ borderColor: C.border, background: C.surface }}
        >
          <div>
            <h2
              className="text-sm font-bold tracking-widest uppercase"
              style={{ color: C.textPrimary, fontFamily: "var(--font-syne)" }}
            >
              Add Transaction
            </h2>
            {!dbAvailable && (
              <p
                className="text-[10px] mt-0.5"
                style={{ color: C.red, fontFamily: "var(--font-mono)" }}
              >
                DATABASE_URL not configured
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-lg leading-none transition-colors"
            style={{ color: C.textMuted }}
            onMouseEnter={(e) => (e.currentTarget.style.color = C.textPrimary)}
            onMouseLeave={(e) => (e.currentTarget.style.color = C.textMuted)}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Transaction type */}
          <div className="grid grid-cols-4 gap-px" style={{ background: C.border }}>
            {TX_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTxType(t)}
                className="py-2 text-xs tracking-widest uppercase font-semibold transition-colors"
                style={{
                  fontFamily: "var(--font-mono)",
                  background: txType === t ? C.amber : C.surfaceAlt,
                  color: txType === t ? "#000" : C.textMuted,
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Asset type */}
          <Field label="Asset Type">
            <div className="grid grid-cols-3 gap-1.5 flex-wrap">
              {(Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map((at) => (
                <button
                  key={at}
                  type="button"
                  onClick={() => setAssetType(at)}
                  className="py-1.5 px-2 text-[10px] tracking-wider uppercase transition-colors"
                  style={{
                    fontFamily: "var(--font-mono)",
                    background: assetType === at ? C.amber + "20" : C.bg,
                    color: assetType === at ? C.amber : C.textMuted,
                    border: `1px solid ${assetType === at ? C.amber : C.border}`,
                  }}
                >
                  {ASSET_TYPE_LABELS[at]}
                </button>
              ))}
            </div>
          </Field>

          {txType === "Trade" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="From Asset">
                  <input
                    style={inputStyle}
                    placeholder="BTC"
                    value={fromSymbol}
                    onChange={(e) => setFromSymbol(e.target.value)}
                    required
                  />
                </Field>
                <Field label="From Quantity">
                  <input
                    style={inputStyle}
                    type="number"
                    step="any"
                    min="0"
                    placeholder="1.0"
                    value={fromQty}
                    onChange={(e) => setFromQty(e.target.value)}
                    required
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="To Asset">
                  <input
                    style={inputStyle}
                    placeholder="ETH"
                    value={toSymbol}
                    onChange={(e) => setToSymbol(e.target.value)}
                    required
                  />
                </Field>
                <Field label="To Quantity">
                  <input
                    style={inputStyle}
                    type="number"
                    step="any"
                    min="0"
                    placeholder="15.0"
                    value={toQty}
                    onChange={(e) => setToQty(e.target.value)}
                    required
                  />
                </Field>
              </div>
              <Field label="Total Value (USD)">
                <input
                  style={inputStyle}
                  type="number"
                  step="any"
                  min="0"
                  placeholder="50000"
                  value={usdValue}
                  onChange={(e) => setUsdValue(e.target.value)}
                  required
                />
              </Field>
            </>
          ) : (
            <>
              <Field label={txType === "Sell" ? "Asset Sold" : txType === "Income" ? "Asset Received" : "Asset Bought"}>
                <input
                  style={inputStyle}
                  placeholder={assetType === "crypto" ? "BTC" : assetType === "stock" ? "AAPL" : assetType === "real_estate" ? "123 Main St" : "Gold Ring"}
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  required
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Quantity / Amount">
                  <input
                    style={inputStyle}
                    type="number"
                    step="any"
                    min="0"
                    placeholder="1.0"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Price per Unit (USD)">
                  <input
                    style={inputStyle}
                    type="number"
                    step="any"
                    min="0"
                    placeholder="45000"
                    value={pricePerUnit}
                    onChange={(e) => setPricePerUnit(e.target.value)}
                  />
                </Field>
              </div>

              {/* USD total — auto-computed or manual */}
              <Field label="Total Value (USD)">
                <div className="relative">
                  <input
                    style={{ ...inputStyle, color: computedUsd && pricePerUnit ? C.amber : C.textPrimary }}
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Auto-calculated from qty × price"
                    value={quantity && pricePerUnit ? computedUsd : usdValue}
                    onChange={(e) => {
                      setPricePerUnit("");
                      setUsdValue(e.target.value);
                    }}
                    readOnly={!!(quantity && pricePerUnit)}
                  />
                  {quantity && pricePerUnit && (
                    <span
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] tracking-widest uppercase"
                      style={{ color: C.textMuted, fontFamily: "var(--font-mono)" }}
                    >
                      auto
                    </span>
                  )}
                </div>
              </Field>
            </>
          )}

          <Field label="Date">
            <input
              style={inputStyle}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </Field>

          <Field label="Notes (optional)">
            <input
              style={inputStyle}
              placeholder="e.g. Coinbase purchase"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          {error && (
            <p
              className="text-xs px-3 py-2"
              style={{
                color: C.red,
                background: C.red + "12",
                border: `1px solid ${C.red}30`,
                fontFamily: "var(--font-mono)",
              }}
            >
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-xs tracking-widest uppercase transition-colors"
              style={{
                fontFamily: "var(--font-mono)",
                color: C.textMuted,
                border: `1px solid ${C.border}`,
                background: "transparent",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !dbAvailable}
              className="flex-1 py-2.5 text-xs tracking-widest uppercase font-semibold transition-colors disabled:opacity-40"
              style={{
                fontFamily: "var(--font-mono)",
                background: C.amber,
                color: "#000",
                border: `1px solid ${C.amber}`,
              }}
            >
              {loading ? "Saving…" : `Add ${txType} →`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
