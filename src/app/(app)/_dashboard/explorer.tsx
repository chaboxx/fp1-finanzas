"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { CategoryDonut, CategoryDot, TrendChart } from "./charts";
import { queryString } from "./filters";
import {
  byCategory,
  addDays,
  outflowTrend,
  topWithOther,
  METRIC_LABELS,
  OTHER_ID,
  type Params,
  type Period,
  type DashboardRow,
  type Metric,
} from "@/lib/dashboard";
import { withDistinctColors } from "@/lib/colors";
import { CURRENCY_LABEL, formatCents, type Currency } from "@/lib/money";
import { dateRangeChanges } from "@/lib/report-filters";
export function ReportExplorer({
  rows,
  previous,
  period,
  params,
  basePath = "/",
  allowedMetrics,
  currency = "PEN",
  showCurrency = false,
}: {
  rows: DashboardRow[];
  previous: DashboardRow[];
  period: Period;
  params: Params;
  basePath?: string;
  allowedMetrics?: Metric[];
  currency?: Currency;
  showCurrency?: boolean; // con cuentas en dólares hay un explorador por moneda
}) {
  const router = useRouter(),
    [pending, startTransition] = useTransition();
  const metric = (
    ["expense", "invest", "outflow", "income"].includes(String(params.metrica))
      ? params.metrica
      : "expense"
  ) as Metric;
  const mode = params.vista === "categorias" ? "categorias" : "total",
    compare = params.comparar !== "0",
    cumulative = params.acumulado === "1";
  const slices = byCategory(rows, metric),
    display = withDistinctColors(topWithOther(slices, 7));
  const colors = new Map(display.map((s) => [s.id, s.color]));
  const points = outflowTrend(
    rows,
    period,
    display.map((s) => s.id),
    metric,
  );
  const prior = outflowTrend(
    previous,
    { ...period, from: period.prevFrom, plotTo: period.prevTo },
    [],
    metric,
  );
  const data = points.map((p, i) =>
    prior[i] ? { ...p, previous: prior[i].total } : p,
  );
  const total = slices.reduce((s, r) => s + r.cents, 0);
  function update(changes: Record<string, string | string[] | null>) {
    startTransition(() =>
      router.push(basePath + "?" + queryString(params, changes), {
        scroll: false,
      }),
    );
  }
  function select(id: string) {
    if (id === OTHER_ID) {
      document
        .getElementById("all-categories-" + currency)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    update({ categoria: [id] });
  }
  const detail = new URLSearchParams();
  detail.set("tipo", metric);
  for (const v of Array.isArray(params.cuenta)
    ? params.cuenta
    : params.cuenta
      ? [params.cuenta]
      : [])
    detail.append("cuenta", v);
  for (const v of Array.isArray(params.categoria)
    ? params.categoria
    : params.categoria
      ? [params.categoria]
      : [])
    detail.append("categoria", v);
  return (
    <div
      className={"space-y-6 transition " + (pending ? "opacity-60" : "")}
      aria-busy={pending}
      role={showCurrency ? "region" : undefined}
      aria-label={
        showCurrency
          ? "Análisis en " + CURRENCY_LABEL[currency].toLowerCase()
          : undefined
      }
    >
      <Card>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow mb-2">Explora tus números</p>
            <h2 className="text-lg font-semibold">
              Evolución en el tiempo
              {showCurrency && " · " + CURRENCY_LABEL[currency].toLowerCase()}
            </h2>
            <p className="muted mt-1 text-xs">
              Importes ejecutados · {METRIC_LABELS[metric].toLowerCase()}
            </p>
          </div>
          <div className="segmented" aria-label="Agrupación temporal">
            {(
              [
                ["day", "Día"],
                ["week", "Semana"],
                ["month", "Mes"],
              ] as const
            ).map(([v, l]) => (
              <button
                disabled={pending}
                key={v}
                type="button"
                className="segment"
                aria-pressed={period.granularity === v}
                onClick={() => update({ agrupacion: v })}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1">
            {(allowedMetrics ?? (Object.keys(METRIC_LABELS) as Metric[])).map(
              (m) => (
                <button
                  disabled={pending}
                  key={m}
                  type="button"
                  aria-pressed={metric === m}
                  onClick={() => update({ metrica: m, categoria: null })}
                  className={
                    "rounded-lg px-3 py-2 text-xs font-medium " +
                    (metric === m
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950"
                      : "text-slate-400")
                  }
                >
                  {METRIC_LABELS[m]}
                </button>
              ),
            )}
          </div>
          <div className="segmented" aria-label="Series">
            {(["total", "categorias"] as const).map((v) => (
              <button
                disabled={pending}
                key={v}
                type="button"
                className="segment"
                aria-pressed={mode === v}
                onClick={() => update({ vista: v })}
              >
                {v === "total" ? "Total" : "Por categoría"}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-5 flex flex-wrap items-center gap-5 border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-slate-800">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={compare}
              onChange={(e) =>
                update({ comparar: e.target.checked ? "1" : "0" })
              }
              className="accent-blue-600"
            />
            Comparar período anterior
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={cumulative}
              onChange={(e) =>
                update({ acumulado: e.target.checked ? "1" : "0" })
              }
              className="accent-blue-600"
            />
            Ver acumulado
          </label>
          <span className="ml-auto font-semibold text-slate-700 dark:text-slate-200">
            Selección: {formatCents(total, currency)}
          </span>
        </div>
        <TrendChart
          key={period.granularity + JSON.stringify(params) + data.length}
          data={data}
          onRangeSelect={
            pending
              ? undefined
              : (from, to) => update(dateRangeChanges(from, to))
          }
          series={display}
          granularity={period.granularity}
          mode={mode}
          comparison={compare}
          cumulative={cumulative}
          title={METRIC_LABELS[metric]}
          detailParams={detail.toString()}
          currency={currency}
        />
        {compare && (
          <p className="mt-4 text-[11px] text-slate-400">
            {period.prevTo > period.prevFrom
              ? "Comparación: " +
                period.prevFrom +
                " al " +
                addDays(period.prevTo, -1) +
                ". "
              : "Sin días ejecutados para comparar. "}
            {mode === "categorias"
              ? "La curva comparativa está disponible en la vista Total."
              : ""}
          </p>
        )}
      </Card>
      <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
        <Card>
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow mb-2">Distribución</p>
              <h2 className="font-semibold">
                {METRIC_LABELS[metric]} por categoría
                {showCurrency && " · " + CURRENCY_LABEL[currency].toLowerCase()}
              </h2>
            </div>
            <span className="rounded-lg bg-slate-50 px-2 py-1 text-[11px] text-slate-400 dark:bg-slate-800">
              % de la selección
            </span>
          </div>
          {total ? (
            <>
              <CategoryDonut
                slices={display}
                total={total}
                onSelect={select}
                currency={currency}
              />
              <p className="mt-5 text-center text-xs text-slate-400">
                Pulsa una porción para filtrar. Otras se desglosa en la lista.
              </p>
            </>
          ) : (
            <div className="flex h-56 items-center justify-center text-sm text-slate-400">
              No hay {METRIC_LABELS[metric].toLowerCase()} con estos filtros.
            </div>
          )}
        </Card>
        <Card>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-semibold">Detalle de categorías</h2>
            {params.categoria && (
              <button
                className="text-xs font-medium text-blue-600"
                onClick={() => update({ categoria: null })}
              >
                Ver todas ×
              </button>
            )}
          </div>
          <div
            id={"all-categories-" + currency}
            className="max-h-80 space-y-4 overflow-auto"
          >
            {slices.map((s) => (
              <button
                disabled={pending}
                type="button"
                key={s.id}
                onClick={() => select(s.id)}
                className="block w-full rounded-lg p-1 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <div className="mb-2 flex items-center gap-2 text-xs">
                  <CategoryDot color={colors.get(s.id) ?? s.color} />
                  <span className="font-medium">{s.name}</span>
                  {!s.isActive && (
                    <span className="text-slate-400">(deshabilitada)</span>
                  )}
                  <strong className="ml-auto tabular-nums">
                    {formatCents(s.cents, currency)}
                  </strong>
                  <span className="w-12 text-right text-slate-400">
                    {s.pct.toFixed(1)} %
                  </span>
                </div>
                <div className="ml-5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-blue-500/60"
                    style={{ width: s.pct + "%" }}
                  />
                </div>
              </button>
            ))}
            {!slices.length && (
              <p className="muted py-10 text-center">
                Aquí aparecerán tus categorías con movimientos.
              </p>
            )}
          </div>
          <p className="mt-5 border-t border-slate-100 pt-4 text-[11px] text-slate-400 dark:border-slate-800">
            Promedio por día del período:{" "}
            <strong>
              {formatCents(
                period.elapsedDays ? Math.round(total / period.elapsedDays) : 0,
                currency,
              )}
            </strong>
          </p>
        </Card>
      </div>
    </div>
  );
}
