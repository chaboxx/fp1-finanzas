import { formatMonth, isMonth } from "@/lib/dates";
import type { CategoryKind, TransactionType } from "@/lib/types";
import type { Currency } from "@/lib/money";
export type Params = Record<string, string | string[] | undefined>;
export type PeriodKey =
  "hoy" | "7d" | "30d" | "mes" | "3m" | "6m" | "anio" | "rango";
export type Granularity = "day" | "week" | "month";
export type Metric = "expense" | "invest" | "outflow" | "income";
export const METRIC_LABELS: Record<Metric, string> = {
  expense: "Gastos",
  invest: "Aportes a inversiones",
  outflow: "Egresos",
  income: "Ingresos",
};
export type Period = {
  key: PeriodKey;
  label: string;
  from: string;
  to: string;
  plotTo: string;
  prevFrom: string;
  prevTo: string;
  granularity: Granularity;
  elapsedDays: number;
};
export type DashboardRow = {
  id?: string;
  account_id?: string;
  category_kind?: CategoryKind;
  type: TransactionType;
  amount_cents: number;
  occurred_on: string;
  category_id: string;
  category_name: string;
  category_color: string | null;
  category_is_active: boolean;
  currency?: Currency; // la de la cuenta; ausente en filas de prueba = soles
};
export const OUTFLOW_TYPES: TransactionType[] = ["expense", "invest"];
export function addDays(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function addMonths(iso: string, months: number) {
  const d = new Date(iso.slice(0, 7) + "-01T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
export const daysBetween = (a: string, b: string) =>
  Math.round(
    (Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000,
  );
export const isDay = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) &&
  new Date(v + "T12:00:00Z").toISOString().slice(0, 10) === v;
export const shortDate = (v: string) =>
  new Date(v + "T12:00:00Z").toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
export function values(params: Params, key: string): string[] {
  const v = params[key];
  return Array.isArray(v) ? v : v ? [v] : [];
}
export function resolvePeriod(params: Params, today: string): Period {
  const get = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : undefined;
  const monthStart = today.slice(0, 7) + "-01";
  let key = (get("periodo") ?? "mes") as PeriodKey,
    from = monthStart,
    to = addMonths(monthStart, 1),
    label = "";
  switch (key) {
    case "hoy":
      from = today;
      to = addDays(today, 1);
      label = "Hoy";
      break;
    case "7d":
    case "30d": {
      const n = key === "7d" ? 7 : 30;
      from = addDays(today, 1 - n);
      to = addDays(today, 1);
      label = "Últimos " + n + " días";
      break;
    }
    case "3m":
    case "6m": {
      const n = key === "3m" ? 3 : 6;
      from = addMonths(monthStart, 1 - n);
      label = "Últimos " + n + " meses";
      break;
    }
    case "anio": {
      const year = /^(20\d{2})$/.test(get("anio") ?? "")
        ? get("anio")!
        : today.slice(0, 4);
      from = year + "-01-01";
      to = Number(year) + 1 + "-01-01";
      label = "Año " + year;
      break;
    }
    case "rango":
      if (
        isDay(get("desde")) &&
        isDay(get("hasta")) &&
        get("desde")! <= get("hasta")! &&
        daysBetween(get("desde")!, get("hasta")!) <= 3660
      ) {
        from = get("desde")!;
        to = addDays(get("hasta")!, 1);
        label = shortDate(from) + " – " + shortDate(get("hasta")!);
        break;
      }
    // falls through
    default:
      key = "mes";
      from = (isMonth(get("mes")) ? get("mes")! : today.slice(0, 7)) + "-01";
      to = addMonths(from, 1);
      label = formatMonth(from.slice(0, 7));
  }
  const plotTo =
    to < addDays(today, 1) ? to : from > today ? from : addDays(today, 1);
  const elapsedDays = Math.max(0, daysBetween(from, plotTo)),
    length = daysBetween(from, to);
  const prevFrom =
    key === "mes"
      ? addMonths(from, -1)
      : key === "anio"
        ? addMonths(from, -12)
        : addDays(from, -length);
  const calendarEnd =
    key === "mes" ? from : key === "anio" ? addMonths(prevFrom, 12) : from;
  const prevTo =
    plotTo === to && (key === "mes" || key === "anio")
      ? calendarEnd
      : addDays(prevFrom, elapsedDays) < calendarEnd
        ? addDays(prevFrom, elapsedDays)
        : calendarEnd;
  const gran = get("agrupacion");
  return {
    key,
    label,
    from,
    to,
    plotTo,
    prevFrom,
    prevTo,
    elapsedDays,
    granularity:
      gran === "day" || gran === "week" || gran === "month"
        ? gran
        : length <= 62
          ? "day"
          : "month",
  };
}
export function summarize(rows: Pick<DashboardRow, "type" | "amount_cents">[]) {
  const sum = (type: TransactionType) =>
    rows.filter((r) => r.type === type).reduce((s, r) => s + r.amount_cents, 0);
  const income = sum("income"),
    expense = sum("expense"),
    invested = sum("invest"),
    divested = sum("divest");
  return {
    income,
    expense,
    invested,
    divested,
    outflow: expense + invested,
    balance: income + divested - expense - invested,
  };
}
export const inRange = (rows: DashboardRow[], from: string, to: string) =>
  rows.filter((r) => r.occurred_on >= from && r.occurred_on < to);
export const change = (current: number, previous: number) =>
  previous === 0 ? null : ((current - previous) / previous) * 100;
export const matchesMetric = (row: DashboardRow, metric: Metric) =>
  metric === "outflow" ? OUTFLOW_TYPES.includes(row.type) : row.type === metric;
export type CategorySlice = {
  id: string;
  name: string;
  color: string | null;
  isActive: boolean;
  cents: number;
  pct: number;
};
export function byCategory(
  rows: DashboardRow[],
  metric: Metric = "outflow",
): CategorySlice[] {
  const map = new Map<string, CategorySlice>();
  for (const r of rows.filter((r) => matchesMetric(r, metric))) {
    const item = map.get(r.category_id) ?? {
      id: r.category_id,
      name: r.category_name,
      color: r.category_color,
      isActive: r.category_is_active,
      cents: 0,
      pct: 0,
    };
    item.cents += r.amount_cents;
    map.set(item.id, item);
  }
  const total = [...map.values()].reduce((s, r) => s + r.cents, 0);
  return [...map.values()]
    .map((r) => ({ ...r, pct: total ? (r.cents / total) * 100 : 0 }))
    .sort((a, b) => b.cents - a.cents);
}
export const outflowByCategory = (rows: DashboardRow[]) => byCategory(rows);
export const OTHER_ID = "__otras__";
export function topWithOther(
  slices: CategorySlice[],
  n: number,
): CategorySlice[] {
  if (slices.length <= n + 1) return slices;
  return [
    ...slices.slice(0, n),
    {
      id: OTHER_ID,
      name: "Otras (" + (slices.length - n) + ")",
      color: null,
      isActive: true,
      cents: slices.slice(n).reduce((s, r) => s + r.cents, 0),
      pct: slices.slice(n).reduce((s, r) => s + r.pct, 0),
    },
  ];
}
export type TrendPoint = {
  key: string;
  label: string;
  total: number;
  end: string;
} & Record<string, number | string>;
export function bucketStart(day: string, gran: Granularity) {
  if (gran === "month") return day.slice(0, 7) + "-01";
  if (gran === "week") {
    const weekday = new Date(day + "T12:00:00Z").getUTCDay();
    return addDays(day, -((weekday + 6) % 7));
  }
  return day;
}
export function outflowTrend(
  rows: DashboardRow[],
  period: Period,
  seriesIds: string[],
  metric: Metric = "outflow",
): TrendPoint[] {
  const points = new Map<string, TrendPoint>();
  const next = (d: string) =>
    period.granularity === "month"
      ? addMonths(d, 1)
      : addDays(d, period.granularity === "week" ? 7 : 1);
  for (
    let d = bucketStart(period.from, period.granularity);
    d < period.plotTo;
    d = next(d)
  ) {
    const start = d < period.from ? period.from : d,
      end = next(d) < period.plotTo ? next(d) : period.plotTo;
    const point: TrendPoint = {
      key: start,
      end,
      label:
        period.granularity === "month"
          ? formatMonth(d.slice(0, 7))
          : shortDate(start),
      total: 0,
    };
    seriesIds.forEach((id) => (point[id] = 0));
    points.set(d, point);
  }
  for (const row of rows) {
    if (
      !matchesMetric(row, metric) ||
      row.occurred_on < period.from ||
      row.occurred_on >= period.plotTo
    )
      continue;
    const p = points.get(bucketStart(row.occurred_on, period.granularity));
    if (!p) continue;
    p.total += row.amount_cents;
    const id = seriesIds.includes(row.category_id) ? row.category_id : OTHER_ID;
    if (id in p) p[id] = Number(p[id]) + row.amount_cents;
  }
  return [...points.values()];
}
