import { summarize } from "./dashboard";
import type { TransactionType } from "./types";

// El resultado corresponde a la fecha de valoración, no a aportes posteriores.
export function investmentResult(
  valuation: { value_cents: number; valued_on: string } | undefined,
  initialCapital: number | null,
  movements: {
    type: TransactionType;
    amount_cents: number;
    occurred_on: string;
  }[],
) {
  if (!valuation || initialCapital === null) return null;
  const flows = summarize(
    movements.filter((m) => m.occurred_on <= valuation.valued_on),
  );
  return (
    valuation.value_cents + flows.divested - flows.invested - initialCapital
  );
}
