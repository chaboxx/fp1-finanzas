import type { FinanceClient } from "@/lib/finance-data";
import { getCatalogs } from "@/lib/finance-data";

export async function getMovementFormOptions(
  db: FinanceClient,
  userId: string,
) {
  const options = await getCatalogs(db, userId);
  return {
    ...options,
    categories: options.categories.filter((c) => c.kind !== "investment"),
  };
}
