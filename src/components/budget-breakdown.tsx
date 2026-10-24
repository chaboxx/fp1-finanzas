import type { BudgetData } from "@/lib/finance-data";
import { formatCents } from "@/lib/money";
import { Card } from "./ui";
import { CategoryDot } from "@/app/(app)/_dashboard/charts";
export function BudgetBreakdown({ budget }: { budget: BudgetData }) {
  return (
    <Card>
      <h2 className="mb-5 font-semibold">Distribución y avance</h2>
      <div className="space-y-5">
        {budget.allocations.map((a) => {
          const limit = Number(a.budget_cents),
            spent = Number(a.spent_cents),
            pct = limit ? (spent / limit) * 100 : 0,
            excess = spent > limit;
          return (
            <div
              key={a.id}
              className={
                "rounded-xl border p-4 " +
                (excess
                  ? "border-rose-100 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-950/20"
                  : "border-slate-100 dark:border-slate-800")
              }
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <CategoryDot color={a.category_color} />
                <strong>{a.category_name}</strong>
                <span className="text-xs text-slate-400">
                  {Number(a.percentage_bps) / 100} % asignado
                  {a.category_kind === "investment" ? " · inversión" : ""}
                </span>
                <span className="ml-auto font-semibold tabular-nums">
                  {formatCents(spent)}{" "}
                  <span className="font-normal text-slate-400">
                    / {formatCents(limit)}
                  </span>
                </span>
              </div>
              <div className="my-3 h-2 rounded-full bg-white dark:bg-slate-800">
                <div
                  className={
                    "h-full rounded-full " +
                    (excess
                      ? "bg-rose-500"
                      : pct >= 80
                        ? "bg-amber-400"
                        : "bg-blue-500")
                  }
                  style={{ width: Math.min(100, pct) + "%" }}
                />
              </div>
              <p
                className={
                  "text-xs " +
                  (excess ? "font-medium text-rose-600" : "text-slate-500")
                }
              >
                {limit ? pct.toFixed(1) + " % utilizado · " : ""}
                {excess
                  ? "Exceso de " + formatCents(spent - limit)
                  : formatCents(limit - spent) + " disponible"}
              </p>
            </div>
          );
        })}
        {!budget.allocations.length && (
          <p className="muted py-8 text-center">
            Crea tu presupuesto mensual y reparte porcentajes entre tus
            categorías de gastos e inversión.
          </p>
        )}
      </div>
    </Card>
  );
}
