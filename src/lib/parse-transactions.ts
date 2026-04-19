import fs from "fs";
import path from "path";

export interface Transaction {
  id: string;
  type: string;
  inputCurrency: string;
  inputAmount: number;
  outputCurrency: string;
  outputAmount: number;
  usdEquivalent: number;
  details: string;
  date: Date;
}

export interface Holding {
  currency: string;
  amount: number;
  isStable: boolean;
  isLoan: boolean;
}

// Transaction types to completely ignore (internal wallet moves or redundant records)
const IGNORE_TYPES = new Set([
  "Transfer In",
  "Transfer Out",
  "Locking Term Deposit",
  "Unlocking Term Deposit",
  "Exchange Deposited On",   // double-record of Deposit To Exchange
  "Exchange Liquidation",    // always paired with Manual Sell Order (which uses correct negative sign); liquidation has positive input amounts that would incorrectly credit the sold asset
  "Manual Repayment",        // always paired with Exchange Liquidation; the USDX created and immediately used is a zero-sum internal pair
  // Exchange Booster is handled separately below (only credit the output, skip synthetic USDT input)
]);

// Stablecoins / USD-pegged assets
const STABLES = new Set(["USDT", "USDC", "xUSD", "USDX", "USD", "GBPX", "GBP"]);

// Loan currencies (negative balance = outstanding debt)
const LOAN_CURRENCIES = new Set(["xUSD", "USDX"]);

// Currencies that are fiat wrappers, loan instruments, or internal routing — never shown in holdings
const HIDDEN_CURRENCIES = new Set(["xUSD", "USDX", "USD", "GBP", "GBPX"]);

function parseUsd(val: string): number {
  if (!val || val === "-") return 0;
  return parseFloat(val.replace(/[$,]/g, "")) || 0;
}

export function parseTransactions(): Transaction[] {
  const csvPath = path.join(process.cwd(), "src/data/nexo_transactions_04-19-2026_13-01-20.csv");
  const raw = fs.readFileSync(csvPath, "utf-8");
  const lines = raw.trim().split("\n");

  const transactions: Transaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Handle quoted fields with commas inside
    const cols: string[] = [];
    let inQuote = false;
    let cur = "";
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { cols.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur.trim());

    if (cols.length < 11) continue;

    const [id, type, inputCurrency, inputAmountStr, outputCurrency, outputAmountStr, usdStr, , , details, dateStr] = cols;

    transactions.push({
      id,
      type,
      inputCurrency,
      inputAmount: parseFloat(inputAmountStr) || 0,
      outputCurrency: outputCurrency === "-" ? inputCurrency : outputCurrency,
      outputAmount: parseFloat(outputAmountStr) || 0,
      usdEquivalent: parseUsd(usdStr),
      details,
      date: new Date(dateStr),
    });
  }

  return transactions.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function computeHoldings(transactions: Transaction[]): Holding[] {
  const balances: Record<string, number> = {};

  const addBalance = (currency: string, amount: number) => {
    if (!currency || currency === "-" || amount === 0) return;
    balances[currency] = (balances[currency] || 0) + amount;
  };

  for (const tx of transactions) {
    if (IGNORE_TYPES.has(tx.type)) continue;

    switch (tx.type) {
      // Earnings: inputAmount is positive for earnings, negative for loan interest charges
      case "Interest":
      case "Fixed Term Interest":
      case "Interest Additional":
        addBalance(tx.inputCurrency, tx.inputAmount);
        break;

      // External deposits
      case "Top up Crypto": {
        // "Credit Granting Top Up" and "Nexo Booster Credit Top Up" are
        // already counted via the preceding Exchange Credit — skip them
        const isInternalTopUp =
          tx.details.includes("Credit Granting Top Up") ||
          tx.details.includes("Nexo Booster Credit Top Up");
        if (!isInternalTopUp) {
          addBalance(tx.outputCurrency, tx.outputAmount);
        }
        break;
      }

      case "Credit Card Withdrawal Credit":
        addBalance(tx.outputCurrency, tx.outputAmount);
        break;

      case "Loan Withdrawal":
        // Booster Loan Withdrawals (USD input) are aggregate records — the XRP
        // sub-components are already captured by Exchange Booster + any paired
        // Exchange (e.g. BTC→XRP). Counting the aggregate would double-count.
        if (tx.inputCurrency !== "USD") {
          addBalance(tx.outputCurrency, tx.outputAmount);
        }
        break;

      // Nexo Booster: only credit the output (XRP received).
      // The USDT input is synthetic Nexo credit that was never actually held.
      case "Exchange Booster":
        addBalance(tx.outputCurrency, tx.outputAmount);
        break;

      // GBP fiat deposit → creates GBPX credit
      case "Deposit To Exchange":
        addBalance(tx.outputCurrency, tx.outputAmount);
        break;

      // External withdrawals, purchases, deductions, repayments
      case "Withdrawal":
      case "Nexo Card Purchase":
      case "Administrative Deduction":
      case "Manual Repayment":
        addBalance(tx.inputCurrency, tx.inputAmount); // negative value
        break;

      // Currency swaps
      case "Exchange":
      case "Exchange Credit":
      case "Exchange Collateral":
      case "Exchange Booster":
      case "Exchange Liquidation":
      case "Manual Sell Order":
        addBalance(tx.inputCurrency, tx.inputAmount); // negative (spent)
        addBalance(tx.outputCurrency, tx.outputAmount); // positive (received)
        break;
    }
  }

  return Object.entries(balances)
    .filter(([currency, amount]) => Math.abs(amount) > 0.000001 && !HIDDEN_CURRENCIES.has(currency))
    .map(([currency, amount]) => ({
      currency,
      amount,
      isStable: STABLES.has(currency),
      isLoan: LOAN_CURRENCIES.has(currency) && amount < 0,
    }))
    .sort((a, b) => {
      // Loans last, then sort by USD value (set later)
      if (a.isLoan && !b.isLoan) return 1;
      if (!a.isLoan && b.isLoan) return -1;
      return b.amount - a.amount;
    });
}

export interface TimelinePoint {
  date: string; // "MMM YY"
  timestamp: number;
  netInvested: number;
  interestCumulative: number;
  totalUsd: number;
}

export function computePortfolioTimeline(transactions: Transaction[]): TimelinePoint[] {
  const DEPOSIT_TYPES = new Set(["Top up Crypto", "Deposit To Exchange", "Credit Card Withdrawal Credit"]);
  const WITHDRAWAL_TYPES = new Set(["Withdrawal", "Nexo Card Purchase", "Administrative Deduction", "Manual Repayment"]);
  const INTEREST_TYPES = new Set(["Interest", "Fixed Term Interest", "Interest Additional"]);

  // Bucket events by month
  const byMonth: Record<string, { flow: number; interest: number }> = {};

  for (const tx of transactions) {
    const key = `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, "0")}`;
    if (!byMonth[key]) byMonth[key] = { flow: 0, interest: 0 };

    if (DEPOSIT_TYPES.has(tx.type)) {
      byMonth[key].flow += tx.usdEquivalent;
    } else if (WITHDRAWAL_TYPES.has(tx.type)) {
      byMonth[key].flow -= tx.usdEquivalent;
    } else if (INTEREST_TYPES.has(tx.type) && tx.inputAmount > 0) {
      byMonth[key].interest += tx.usdEquivalent;
    }
  }

  const points: TimelinePoint[] = [];
  let cumFlow = 0;
  let cumInterest = 0;

  for (const key of Object.keys(byMonth).sort()) {
    const [y, m] = key.split("-").map(Number);
    cumFlow += byMonth[key].flow;
    cumInterest += byMonth[key].interest;
    const d = new Date(y, m - 1, 1);
    points.push({
      date: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      timestamp: d.getTime(),
      netInvested: Math.max(0, cumFlow),
      interestCumulative: cumInterest,
      totalUsd: Math.max(0, cumFlow) + cumInterest,
    });
  }

  return points;
}

export function computeInterestEarned(transactions: Transaction[]): Record<string, number> {
  const interestTypes = new Set(["Interest", "Fixed Term Interest", "Interest Additional"]);
  const totals: Record<string, number> = {};

  for (const tx of transactions) {
    if (!interestTypes.has(tx.type)) continue;
    // Only count positive earnings, not loan interest charges
    if (tx.inputAmount > 0) {
      totals[tx.inputCurrency] = (totals[tx.inputCurrency] || 0) + tx.inputAmount;
    }
  }
  return totals;
}
