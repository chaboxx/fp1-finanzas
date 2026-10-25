import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import type { DashboardRow } from "./dashboard";
import type { Account, Category } from "./types";
import type { Currency } from "./money";
export type FinanceClient = SupabaseClient<Database>;
export type DbRow<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export async function generateDue(db: FinanceClient) {
  const { error } = await db.rpc("generate_recurring_transactions");
  if (error)
    throw new Error("No se pudieron procesar los movimientos recurrentes", {
      cause: error,
    });
}

// Consultar hasta una página vacía también funciona si el servidor limita a menos de 500 filas.
export async function fetchAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
) {
  const result: T[] = [];
  for (let offset = 0; ;) {
    const { data, error } = await page(offset, offset + 499);
    if (error)
      throw new Error("No se pudieron cargar los datos. Intenta de nuevo.", {
        cause: error,
      });
    if (!data?.length) break;
    result.push(...data);
    offset += data.length;
  }
  return result;
}
// Sin moneda devuelve ambas: quien muestre totales debe separarlas (nunca sumar soles con dólares).
export async function getReportRows(
  db: FinanceClient,
  from: string,
  to: string,
  currency?: Currency,
): Promise<DashboardRow[]> {
  const rows = await fetchAll((a, b) => {
    const query = db
      .from("categorized_movements")
      .select("*")
      .gte("occurred_on", from)
      .lt("occurred_on", to);
    return (currency ? query.eq("currency", currency) : query)
      .order("occurred_on")
      .order("id")
      .range(a, b);
  });
  return rows.map((r) => ({
    id: r.id!,
    type: r.type!,
    amount_cents: Number(r.amount_cents),
    occurred_on: r.occurred_on!,
    category_id: r.category_id!,
    category_name: r.category_name!,
    category_color: r.category_color,
    category_is_active: r.category_is_active!,
    account_id: r.account_id!,
    category_kind: r.category_kind!,
    currency: r.currency ?? "PEN",
  }));
}
export async function getCatalogs(db: FinanceClient, userId: string) {
  const [accounts, categories, profile] = await Promise.all([
    fetchAll((a, b) =>
      db
        .from("accounts")
        .select("*")
        .order("created_at")
        .order("id")
        .range(a, b),
    ),
    fetchAll((a, b) =>
      db.from("categories").select("*").order("name").order("id").range(a, b),
    ),
    db.from("profiles").select("default_account_id").eq("id", userId).single(),
  ]);
  if (profile.error) throw new Error("No se pudo cargar tu configuración");
  return {
    accounts: accounts as Account[],
    categories: categories as Category[],
    defaultAccountId: profile.data.default_account_id,
  };
}
export async function getBudgetData(db: FinanceClient, month: string) {
  const [plan, allocations, legacy] = await Promise.all([
    db
      .from("budget_plans")
      .select("*")
      .eq("month", month + "-01")
      .maybeSingle(),
    fetchAll((a, b) =>
      db
        .from("budget_plan_progress")
        .select("*")
        .eq("month", month + "-01")
        .order("id")
        .range(a, b),
    ),
    fetchAll((a, b) =>
      db
        .from("budget_progress")
        .select("*")
        .eq("month", month + "-01")
        .order("budget_id")
        .range(a, b),
    ),
  ]);
  if (plan.error)
    throw new Error(
      "No se pudo cargar el presupuesto. Comprueba las migraciones pendientes.",
    );
  return { plan: plan.data, allocations, legacy };
}
export type BudgetData = Awaited<ReturnType<typeof getBudgetData>>;
