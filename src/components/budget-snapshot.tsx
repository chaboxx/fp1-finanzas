import Link from "next/link";
import { Card } from "./ui";
import { Icon } from "./icons";
import { formatCents } from "@/lib/money";
import { formatMonth } from "@/lib/dates";
import type { BudgetData } from "@/lib/finance-data";
export function BudgetSnapshot({
  budget,
  month,
  income,
  outflow,
}: {
  budget: BudgetData;
  month: string;
  income: number;
  outflow: number;
}) {
  const total = budget.plan?.total_cents ?? 0;
  const warnings = budget.allocations.filter(
    (a) =>
      Number(a.spent_cents) >= Number(a.budget_cents) * 0.8 &&
      Number(a.spent_cents) > 0,
  );
  const used = total ? (outflow / total) * 100 : 0;
  return (
    <Card className="h-full">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Tu plan del mes</h2>
          <p className="mt-1 text-[11px] text-slate-400">
            {formatMonth(month)} · todas las cuentas
          </p>
        </div>
        <Link
          href={"/presupuesto?mes=" + month}
          className="text-xs font-semibold text-blue-600"
        >
          Ver presupuesto →
        </Link>
      </div>
      {!budget.plan ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-5 dark:border-slate-700">
          <p className="text-sm font-medium">Dale un destino a tu dinero</p>
          <p className="muted mt-2 text-xs">
            Define el total del mes y distribúyelo entre tus categorías de gasto
            e inversión.
          </p>
          <Link
            href={"/presupuesto?mes=" + month}
            className="btn btn-primary mt-4"
          >
            Crear presupuesto
          </Link>
        </div>
      ) : (
        <>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] text-slate-400">EGRESOS / PREVISTO</p>
              <p className="mt-2 text-xl font-semibold tabular-nums">
                {formatCents(outflow)}{" "}
                <span className="text-sm font-normal text-slate-400">
                  / {formatCents(total)}
                </span>
              </p>
            </div>
            <span
              className={
                "text-sm font-semibold " +
                (used > 100 ? "text-red-600" : "text-blue-600")
              }
            >
              {used.toFixed(1)} %
            </span>
          </div>
          <div className="my-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={
                "h-full rounded-full " +
                (used > 100
                  ? "bg-red-500"
                  : used >= 80
                    ? "bg-amber-500"
                    : "bg-blue-500")
              }
              style={{ width: Math.min(100, used) + "%" }}
            />
          </div>
          <p className="text-xs text-slate-500">
            Ingreso real: <strong>{formatCents(income)}</strong> · diferencia
            con lo previsto: {formatCents(income - total)}.
          </p>
          <div className="mt-5 space-y-2">
            {warnings.length ? (
              warnings.slice(0, 4).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                >
                  <Icon name="alert" size={14} />
                  <span>
                    {a.category_name}:{" "}
                    {Number(a.spent_cents) > Number(a.budget_cents)
                      ? "exceso de " +
                        formatCents(
                          Number(a.spent_cents) - Number(a.budget_cents),
                        )
                      : Number(a.spent_cents) === Number(a.budget_cents)
                        ? "límite alcanzado"
                        : "cerca del límite"}
                  </span>
                </div>
              ))
            ) : (
              <p className="flex items-center gap-2 text-xs text-emerald-600">
                <Icon name="check" size={15} />
                Tus categorías están dentro del presupuesto.
              </p>
            )}
          </div>
          {outflow > income && (
            <p className="mt-3 text-xs text-red-600">
              Los egresos superan los ingresos reales en{" "}
              {formatCents(outflow - income)}.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
