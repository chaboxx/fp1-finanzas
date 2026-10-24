"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  ReferenceArea,
  Tooltip,
  XAxis,
  YAxis,
  type MouseHandlerDataParam,
} from "recharts";
import { CATEGORY_PALETTE, categoryColor } from "@/lib/colors";
import {
  type CategorySlice,
  type Granularity,
  type TrendPoint,
  addDays,
} from "@/lib/dashboard";
import { formatCents } from "@/lib/money";
import { useIsDark } from "@/lib/theme";
import { rangeFromTrend } from "@/lib/report-filters";
function useDark() {
  return useIsDark();
}
function useClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
const subscribeSize = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
function useSmall() {
  return useSyncExternalStore(
    subscribeSize,
    () => window.innerWidth < 640,
    () => false,
  );
}
const axisMoney = (cents: number) =>
  "S/ " +
  new Intl.NumberFormat("es-PE", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(cents / 100);
const chartDate = (day: string) =>
  new Date(day + "T12:00:00Z").toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
export type Series = { id: string; name: string; color: string | null };
export function TrendChart({
  data,
  series,
  granularity,
  mode = "total",
  cumulative = false,
  comparison = false,
  title = "Egresos",
  detailParams = "",
  disableDetail = false,
  onRangeSelect,
}: {
  data: TrendPoint[];
  series: Series[];
  granularity: Granularity;
  mode?: "total" | "categorias";
  cumulative?: boolean;
  comparison?: boolean;
  title?: string;
  detailParams?: string;
  disableDetail?: boolean;
  onRangeSelect?: (from: string, to: string) => void;
}) {
  const dark = useDark(),
    ready = useClient(),
    [hidden, setHidden] = useState<string[]>([]);
  const small = useSmall();
  const drag = useRef<{
    start: number;
    end: number;
    x: number;
    dragged: boolean;
  } | null>(null);
  const skipClick = useRef(false);
  const [selection, setSelection] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const selectedRange = selection
    ? rangeFromTrend(data, selection.start, selection.end)
    : null;
  function indexAt(state: MouseHandlerDataParam) {
    const byLabel = data.findIndex((point) => point.key === state.activeLabel);
    if (byLabel >= 0) return byLabel;
    const index =
      state.activeTooltipIndex == null ? -1 : Number(state.activeTooltipIndex);
    return Number.isInteger(index) && index >= 0 && index < data.length
      ? index
      : null;
  }
  function finishRange(state: MouseHandlerDataParam, clientX: number) {
    const current = drag.current;
    drag.current = null;
    setSelection(null);
    if (!current) return;
    const end = indexAt(state) ?? current.end;
    if (
      (current.dragged || Math.abs(clientX - current.x) > 4) &&
      end !== current.start
    ) {
      skipClick.current = true;
      const range = rangeFromTrend(data, current.start, end);
      if (range) onRangeSelect?.(range.from, range.to);
    }
  }
  const lines =
    mode === "total"
      ? [
          {
            id: "total",
            name: title,
            color: CATEGORY_PALETTE[0].light as string,
          },
        ]
      : series;
  const sums: Record<string, number> = {};
  const plotted = data.map((p) => {
    const out = { ...p };
    if (cumulative)
      for (const id of [...lines.map((l) => l.id), "previous"]) {
        if (typeof p[id] !== "number") continue;
        sums[id] = (sums[id] ?? 0) + Number(p[id]);
        out[id] = sums[id];
      }
    return out;
  });
  const detailHref = (p: TrendPoint) =>
    "/movimientos?periodo=rango&" +
    detailParams +
    "&desde=" +
    p.key +
    "&hasta=" +
    addDays(p.end, -1);
  const tooltipColor = dark ? "#94a3b8" : "#64748b";
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>
          {disableDetail
            ? "Valores en las fechas informadas"
            : (granularity === "day"
                ? "Cada punto representa un día"
                : granularity === "week"
                  ? "Semanas de lunes a domingo"
                  : "Cada punto representa un mes") +
              (onRangeSelect
                ? " · arrastra para seleccionar fechas; pulsa un punto para ver movimientos"
                : " · pulsa un punto para ver movimientos")}
        </span>
      </div>
      <div
        className={
          "h-[310px] w-full select-none sm:h-[350px] " +
          (onRangeSelect ? "cursor-crosshair" : "")
        }
        role="img"
        aria-label={
          title +
          " por " +
          { day: "día", week: "semana", month: "mes" }[granularity] +
          ". Valores disponibles en la tabla."
        }
      >
        {ready && data.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={plotted}
              margin={{ top: 12, right: 14, left: 0, bottom: 8 }}
              onMouseDown={(state, event) => {
                skipClick.current = false;
                if (!onRangeSelect || event.button !== 0) return;
                const index = indexAt(state);
                if (index === null) return;
                drag.current = {
                  start: index,
                  end: index,
                  x: event.clientX,
                  dragged: false,
                };
                setSelection({ start: index, end: index });
              }}
              onMouseMove={(state, event) => {
                const current = drag.current;
                if (!current) return;
                const index = indexAt(state);
                if (index === null) return;
                current.end = index;
                current.dragged =
                  current.dragged || Math.abs(event.clientX - current.x) > 4;
                setSelection({ start: current.start, end: index });
              }}
              onMouseUp={(state, event) => finishRange(state, event.clientX)}
              onMouseLeave={() => {
                drag.current = null;
                setSelection(null);
              }}
              onClick={(state) => {
                if (skipClick.current) {
                  skipClick.current = false;
                  return;
                }
                const i = indexAt(state);
                if (!disableDetail && i !== null)
                  window.location.assign(detailHref(data[i]));
              }}
            >
              <CartesianGrid
                vertical={false}
                stroke={dark ? "#253247" : "#edf1f7"}
              />
              <XAxis
                dataKey="key"
                tickFormatter={(v) =>
                  granularity === "day"
                    ? String(Number(String(v).slice(-2)))
                    : new Date(String(v) + "T12:00:00Z").toLocaleDateString(
                        "es-PE",
                        {
                          day: granularity === "week" ? "numeric" : undefined,
                          month: "short",
                          timeZone: "UTC",
                        },
                      )
                }
                tick={{ fontSize: 11, fill: tooltipColor }}
                interval={
                  data.length <= (small ? 7 : 31) ? 0 : "preserveStartEnd"
                }
                minTickGap={16}
                tickLine={false}
                axisLine={false}
                dy={10}
              />
              <YAxis
                tickFormatter={axisMoney}
                tick={{ fontSize: 11, fill: tooltipColor }}
                tickLine={false}
                axisLine={false}
                width={68}
                domain={[0, "auto"]}
              />
              <Tooltip
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xl dark:border-slate-700 dark:bg-slate-900">
                      {selectedRange && (
                        <dl
                          className="mb-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 border-b border-slate-100 pb-3 dark:border-slate-800"
                          aria-label="Fechas seleccionadas"
                        >
                          <dt className="text-slate-500">Inicio</dt>
                          <dd className="text-right font-semibold">
                            <time dateTime={selectedRange.from}>
                              {chartDate(selectedRange.from)}
                            </time>
                          </dd>
                          <dt className="text-slate-500">Fin</dt>
                          <dd className="text-right font-semibold">
                            <time dateTime={selectedRange.to}>
                              {chartDate(selectedRange.to)}
                            </time>
                          </dd>
                        </dl>
                      )}
                      <p className="mb-2 font-medium text-slate-500">
                        {selectedRange ? "Punto: " : ""}
                        {String(label)}
                        {cumulative ? " · acumulado" : ""}
                      </p>
                      {payload.map((p) => (
                        <p
                          key={String(p.dataKey)}
                          className="my-1 flex items-center gap-3"
                        >
                          <span style={{ color: p.color }}>●</span>
                          <span className="text-slate-500">{p.name}</span>
                          <strong className="ml-auto tabular-nums">
                            {formatCents(Number(p.value))}
                          </strong>
                        </p>
                      ))}
                    </div>
                  ) : null
                }
              />
              {lines
                .filter((l) => !hidden.includes(l.id))
                .map((l) => (
                  <Line
                    key={l.id}
                    dataKey={l.id}
                    name={l.name}
                    type="linear"
                    stroke={categoryColor(l.color, dark)}
                    strokeWidth={2.4}
                    dot={false}
                    activeDot={{
                      r: 5,
                      strokeWidth: 3,
                      stroke: dark ? "#0f172a" : "white",
                    }}
                    isAnimationActive={false}
                  />
                ))}
              {comparison && mode === "total" && (
                <Line
                  dataKey="previous"
                  name="Período anterior"
                  type="linear"
                  stroke={dark ? "#94a3b8" : "#94a3b8"}
                  strokeDasharray="5 5"
                  strokeWidth={1.6}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}
              {selection && data[selection.start] && data[selection.end] && (
                <ReferenceArea
                  x1={data[Math.min(selection.start, selection.end)].key}
                  x2={data[Math.max(selection.start, selection.end)].key}
                  fill={categoryColor(CATEGORY_PALETTE[0].light, dark)}
                  fillOpacity={0.16}
                  stroke={categoryColor(CATEGORY_PALETTE[0].light, dark)}
                  strokeOpacity={0.5}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
        {data.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            No hay intervalos ejecutados para este período.
          </div>
        )}
      </div>
      {mode === "categorias" && (
        <div
          className="mt-4 flex flex-wrap gap-2"
          aria-label="Leyenda interactiva"
        >
          {lines.map((l) => (
            <button
              type="button"
              key={l.id}
              aria-pressed={!hidden.includes(l.id)}
              onClick={() =>
                setHidden(
                  hidden.includes(l.id)
                    ? hidden.filter((id) => id !== l.id)
                    : [...hidden, l.id],
                )
              }
              className={
                "flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs dark:border-slate-700 " +
                (hidden.includes(l.id) ? "opacity-40 line-through" : "")
              }
            >
              <span
                className="h-0.5 w-4"
                style={{ backgroundColor: categoryColor(l.color, dark) }}
              />
              {l.name}
            </button>
          ))}
        </div>
      )}
      <details className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
        <summary className="text-xs font-semibold text-blue-600">
          Ver valores y movimientos por intervalo
        </summary>
        <div className="mt-3 max-h-72 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-slate-400">
                <th className="py-2">Intervalo</th>
                <th className="text-right">
                  {cumulative ? "Acumulado" : "Monto"}
                </th>
                {comparison && <th className="text-right">Anterior</th>}
                <th className="text-right">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {plotted.map((p) => (
                <tr
                  key={p.key}
                  className="border-t border-slate-100 dark:border-slate-800"
                >
                  <td className="py-3">
                    {p.key}
                    {p.end > addDays(p.key, 1)
                      ? " — " + addDays(p.end, -1)
                      : ""}
                  </td>
                  <td className="text-right font-medium tabular-nums">
                    {formatCents(p.total)}
                  </td>
                  {comparison && (
                    <td className="text-right text-slate-400 tabular-nums">
                      {typeof p.previous === "number"
                        ? formatCents(p.previous)
                        : "—"}
                    </td>
                  )}
                  <td className="text-right">
                    {!disableDetail && (
                      <Link
                        href={detailHref(p)}
                        className="font-medium text-blue-600"
                      >
                        Ver movimientos →
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
export function CategoryDonut({
  slices,
  total,
  onSelect,
}: {
  slices: CategorySlice[];
  total: number;
  onSelect?: (id: string) => void;
}) {
  const dark = useDark(),
    ready = useClient();
  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-56"
      role="img"
      aria-label="Distribución por categoría; valores y selección disponibles en la lista"
    >
      {ready && (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="cents"
              nameKey="name"
              innerRadius="72%"
              outerRadius="96%"
              startAngle={90}
              endAngle={-270}
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
              onClick={(_, index) => onSelect?.(slices[index].id)}
            >
              {slices.map((s) => (
                <Cell
                  key={s.id}
                  fill={categoryColor(s.color, dark)}
                  cursor={onSelect ? "pointer" : "default"}
                />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xl dark:bg-slate-900">
                    <strong>{String(payload[0].name)}</strong>
                    <p className="mt-1">
                      {formatCents(Number(payload[0].value))} ·{" "}
                      {((Number(payload[0].value) / total) * 100).toFixed(1)} %
                    </p>
                  </div>
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
      )}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="mb-1 text-[11px] text-slate-400">
          TOTAL SELECCIONADO
        </span>
        <strong className="text-xl tabular-nums">{formatCents(total)}</strong>
      </div>
    </div>
  );
}
export function CategoryDot({ color }: { color: string | null }) {
  const dark = useDark();
  return (
    <span
      className="size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: categoryColor(color, dark) }}
    />
  );
}
