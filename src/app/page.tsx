import {
  parseTransactions,
  computeHoldings,
  computeInterestEarned,
} from "@/lib/parse-transactions";
import PortfolioDashboard from "@/components/portfolio-dashboard";

export const dynamic = "force-dynamic";

export default function Home() {
  const transactions = parseTransactions();
  const holdings = computeHoldings(transactions);
  const interestEarned = computeInterestEarned(transactions);

  return (
    <PortfolioDashboard
      holdings={holdings}
      transactions={transactions}
      interestEarned={interestEarned}
    />
  );
}
