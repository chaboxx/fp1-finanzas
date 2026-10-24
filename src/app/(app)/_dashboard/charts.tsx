"use client";

import { useState, useSyncExternalStore } from "react";
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CATEGORY_PALETTE, categoryColor } from "@/lib/colors";
import type { CategorySlice, TrendPoint } from "@/lib/dashboard";
import { formatCents } from "@/lib/money";

// ---------- tema ----------

const darkQuery = "(prefers-color-scheme: dark)";
function subscribe(cb: () => void) {
  const mq = window.matchMedia(darkQuery);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function useIsDark() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(darkQuery).matches, () => false);
}
// Los gráficos miden su contenedor: se dibujan solo en el navegador.
function useIsClient() {
  return useSyncExternalStore(() => () => {}, () => true, () => false);
}

function chartTheme(dark: boolean) {
  return dark
    ? { surface: "#18181b", grid: "#27272a", axis: "#a1a1aa" }
    : { surface: "#ffffff", grid: "#e4e4e7", axis: "#71717a" };
}

const compact = new Intl.NumberFormat("es-PE", { notation: "compact", maximumFractionDigits: 1 });
const axisMoney = (cents: number) => `S/ ${compact.format(cents / 100)}`;

// ---------- tooltip: el valor primero, la serie después; clave de línea, no caja ----------

type TooltipRow = { name: string; value: number; color: string };

function ChartTooltip({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="min-w-40 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      <p className="mb-1 text-xs text-zinc-500">{title}</p>
      {rows.map((r) => (
        <p key={r.name} className="flex items-center gap-2">
          <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
          <span className="font-semibold tabular-nums">{formatCents(r.value)}</span>
          <span className="truncate text-zinc-500">{r.name}</span>
        </p>
      ))}
    </div>
  );
}

// ---------- evolución en el tiempo ----------

type Series = { id: string; name: string; color: string | null };

export function TrendChart({ data, series, granularity }: { data: TrendPoint[]; series: Series[]; granularity: "day" | "month" }) {
  const [mode, setMode] = useState<"total" | "categorias">("total");
  const dark = useIsDark();
  const isClient = useIsClient();
  const theme = chartTheme(dark);

  const lines =
    mode === "total"
      ? [{ id: "total", name: "Egresos", color: dark ? CATEGORY_PALETTE[0].dark : CATEGORY_PALETTE[0].light }]
      : series.map((s) => ({ ...s, color: categoryColor(s.color, dark) }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Egresos {granularity === "day" ? "por día" : "por mes"}</h2>
        <div role="radiogroup" aria-label="Ver" className="flex gap-1 rounded-lg bg-zinc-100 p-0.5 text-xs font-medium dark:bg-zinc-800">
          {(["total", "categorias"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              disabled={m === "categorias" && series.length === 0}
              className="rounded-md px-2.5 py-1 text-zinc-600 aria-checked:bg-white aria-checked:text-zinc-900 aria-checked:shadow-sm disabled:opacity-40 dark:text-zinc-400 dark:aria-checked:bg-zinc-900 dark:aria-checked:text-zinc-100"
            >
              {m === "total" ? "Total" : "Por categoría"}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64">
        {isClient && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={theme.grid} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: theme.axis }}
                tickLine={false}
                axisLine={{ stroke: theme.grid }}
                minTickGap={24}
              />
              <YAxis tickFormatter={axisMoney} tick={{ fontSize: 12, fill: theme.axis }} tickLine={false} axisLine={false} width={64} />
              <Tooltip
                cursor={{ stroke: theme.axis, strokeWidth: 1 }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <ChartTooltip
                      title={String(label)}
                      rows={lines.map((l) => ({
                        name: l.name,
                        color: l.color,
                        value: Number(payload[0].payload[l.id] ?? 0),
                      }))}
                    />
                  ) : null
                }
              />
              {lines.map((l) => (
                <Line
                  key={l.id}
                  dataKey={l.id}
                  name={l.name}
                  type="linear"
                  stroke={l.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: theme.surface }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {mode === "categorias" && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400" aria-label="Leyenda">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: l.color }} />
              {l.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- distribución por categoría (dona) ----------

export function CategoryDonut({ slices, total }: { slices: CategorySlice[]; total: number }) {
  const dark = useIsDark();
  const isClient = useIsClient();
  const theme = chartTheme(dark);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-60">
      {isClient && (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="cents"
              nameKey="name"
              innerRadius="62%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke={theme.surface}
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((s) => (
                <Cell key={s.id} fill={categoryColor(s.color, dark)} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const s = payload[0].payload as CategorySlice;
                return (
                  <ChartTooltip
                    title={`${s.pct.toFixed(1)}% de los egresos`}
                    rows={[{ name: s.name, value: s.cents, color: categoryColor(s.color, dark) }]}
                  />
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-zinc-500">Total</span>
        <span className="text-lg font-semibold tabular-nums">{formatCents(total)}</span>
      </div>
    </div>
  );
}

// Punto de color para listas (respeta el modo oscuro).
export function CategoryDot({ color }: { color: string | null }) {
  const dark = useIsDark();
  return <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(color, dark) }} />;
}
