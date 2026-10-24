"use client";
import { useActionState, useState, useTransition } from "react";
import { Card } from "@/components/ui";
import { SubmitButton, FormAlert } from "@/components/form-field";
import { Icon } from "@/components/icons";
import { RequiredMark } from "@/components/required-mark";
import type { Category } from "@/lib/types";
import type { BudgetData } from "@/lib/finance-data";
import { allocateCents, parsePercentage } from "@/lib/budget";
import { centsToInput, formatCents, parseToCents } from "@/lib/money";
import { saveBudget } from "./actions";
import { CategoryDot } from "../_dashboard/charts";
import { useCloseModal } from "@/components/form-modal";
export function BudgetForm({
  month,
  categories,
  budget,
  previous,
  spent,
}: {
  month: string;
  categories: Category[];
  budget: BudgetData;
  previous: BudgetData;
  spent: Record<string, number>;
}) {
  const closeModal = useCloseModal();
  const [total, setTotal] = useState(
    budget.plan ? centsToInput(budget.plan.total_cents) : "",
  );
  const [percentages, setPercentages] = useState<Record<string, string>>(
    Object.fromEntries(
      budget.allocations.map((a) => [
        a.category_id!,
        String(Number(a.percentage_bps) / 100),
      ]),
    ),
  );
  const [state, action, pending] = useActionState(
      async (prev: import("@/lib/action-state").ActionState, fd: FormData) => {
        const result = await saveBudget(prev, fd);
        if (result.ok) closeModal?.();
        return result;
      },
      {},
    ),
    [, startTransition] = useTransition();
  const cents = parseToCents(total) ?? 0,
    bps = Object.values(percentages).reduce(
      (s, v) => s + (parsePercentage(v) ?? 0),
      0,
    );
  const invalidPercentage = Object.values(percentages).some(
    (v) => parsePercentage(v) === null,
  );
  const visible = categories.filter(
    (c) =>
      c.kind !== "income" &&
      (c.is_active || Number(percentages[c.id]) || spent[c.id]),
  );
  const assigned = visible.reduce(
    (s, c) =>
      s + allocateCents(cents, parsePercentage(percentages[c.id] ?? "") ?? 0),
    0,
  );
  function copy() {
    if (!previous.plan) return;
    setPercentages(
      Object.fromEntries(
        previous.allocations
          .filter((a) =>
            categories.some(
              (c) =>
                c.id === a.category_id &&
                (c.is_active ||
                  budget.allocations.some(
                    (current) => current.category_id === c.id,
                  )),
            ),
          )
          .map((a) => [a.category_id!, String(Number(a.percentage_bps) / 100)]),
      ),
    );
    if (!total) setTotal(centsToInput(previous.plan.total_cents));
  }
  return (
    <form
      action={action}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="space-y-6"
    >
      <input type="hidden" name="month" value={month} />
      <Card>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow mb-2">Paso 1 · tu punto de partida</p>
            <h2 className="font-semibold">¿Con cuánto cuentas este mes?</h2>
            <p className="muted mt-2 text-xs">
              Tu previsión es fija. Cobrar un ingreso no cambia estos límites.
            </p>
          </div>
          <button
            type="button"
            disabled={!previous.plan}
            onClick={copy}
            className="btn btn-secondary disabled:opacity-40"
          >
            Copiar distribución anterior
          </button>
        </div>
        <label
          htmlFor="budget-total"
          className="block text-xs font-medium text-slate-500"
        >
          Total previsto mensual (S/)
          <RequiredMark />
        </label>
        <input
          id="budget-total"
          className="field mt-2 max-w-sm py-4 text-2xl font-semibold"
          name="total"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          inputMode="decimal"
          placeholder="5,000.00"
          required
        />
        <div className="mt-5 grid grid-cols-2 gap-4 text-xs sm:grid-cols-3">
          <div>
            <p className="text-slate-400">Porcentaje asignado</p>
            <p
              className={
                "mt-1 text-lg font-semibold " +
                (bps > 10000 ? "text-red-600" : "")
              }
            >
              {(bps / 100).toFixed(2)} %
            </p>
          </div>
          <div>
            <p className="text-slate-400">Monto asignado</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatCents(assigned)}
            </p>
          </div>
          <div>
            <p className="text-slate-400">Pendiente de asignar</p>
            <p className="mt-1 text-lg font-semibold text-blue-600 tabular-nums">
              {formatCents(cents - assigned)}
            </p>
          </div>
        </div>
        {bps > 10000 && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            Reduce la distribución: supera el 100 %.
          </p>
        )}
        {invalidPercentage && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            Usa porcentajes entre 0 y 100, con hasta dos decimales.
          </p>
        )}
      </Card>
      <Card>
        <p className="eyebrow mb-2">Paso 2 · dale un destino</p>
        <h2 className="mb-6 font-semibold">Distribuye entre tus categorías</h2>
        {(["expense", "investment"] as const).map((kind) => (
          <fieldset key={kind} className="mb-6">
            <legend className="mb-4 text-xs font-semibold text-slate-400">
              {kind === "expense" ? "GASTOS" : "INVERSIONES"}
            </legend>
            <div className="space-y-2">
              {visible
                .filter((c) => c.kind === kind)
                .map((c) => {
                  const p = parsePercentage(percentages[c.id] ?? "") ?? 0,
                    limit = allocateCents(cents, p),
                    used = spent[c.id] ?? 0,
                    pct = limit ? (used / limit) * 100 : 0;
                  return (
                    <div
                      key={c.id}
                      className="rounded-xl border border-slate-100 p-4 dark:border-slate-800"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <label
                          htmlFor={"pct-" + c.id}
                          className="flex min-w-36 flex-1 items-center gap-2 text-sm font-medium"
                        >
                          <CategoryDot color={c.color} />
                          {c.name}
                          {!c.is_active && (
                            <span className="text-xs text-slate-400">
                              (deshabilitada)
                            </span>
                          )}
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            id={"pct-" + c.id}
                            name={"pct_" + c.id}
                            value={percentages[c.id] ?? ""}
                            onChange={(e) =>
                              setPercentages({
                                ...percentages,
                                [c.id]: e.target.value,
                              })
                            }
                            inputMode="decimal"
                            placeholder="0"
                            className="field w-20 text-right"
                            aria-label={"Porcentaje para " + c.name}
                          />
                          <span className="text-sm text-slate-400">%</span>
                        </div>
                        <strong className="w-28 text-right text-sm tabular-nums">
                          {formatCents(limit)}
                        </strong>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                        <span>Ejecutado: {formatCents(used)}</span>
                        <span
                          className={
                            used > limit && used > 0
                              ? "font-semibold text-red-600"
                              : ""
                          }
                        >
                          {p
                            ? pct.toFixed(1) +
                              " % utilizado · " +
                              (used > limit
                                ? "exceso " + formatCents(used - limit)
                                : formatCents(limit - used) + " disponible")
                            : used
                              ? "Sin presupuesto"
                              : "Sin asignación"}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className={
                            "h-full rounded-full " +
                            (used > limit
                              ? "bg-red-500"
                              : pct >= 80
                                ? "bg-amber-500"
                                : "bg-blue-500")
                          }
                          style={{
                            width:
                              (limit ? Math.min(pct, 100) : used ? 100 : 0) +
                              "%",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </fieldset>
        ))}
        <p className="text-[11px] text-slate-400">
          Los importes se truncan a céntimos. Cualquier residuo queda pendiente
          de asignar. Las transferencias y los rescates no consumen ni reponen
          el presupuesto.
        </p>
      </Card>
      {state.error && <FormAlert tone="error">{state.error}</FormAlert>}
      {state.ok && <FormAlert tone="success">{state.message}</FormAlert>}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <span className="flex items-center gap-2 text-xs text-slate-500">
          <Icon name="budget" size={16} />
          Guardar solo cambia {month}.
        </span>
        <div className="w-full sm:w-52">
          <SubmitButton
            pending={pending}
            disabled={bps > 10000 || invalidPercentage}
          >
            Guardar presupuesto
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
