// Cálculos del dashboard. Funciones puras (sin Supabase ni React) para poder
// probarlas sin base de datos: reciben filas y devuelven números.
import { formatMonth, isMonth } from "@/lib/dates";
import type { TransactionType } from "@/lib/types";

export type PeriodKey = "mes" | "3m" | "6m" | "anio" | "rango";

export type Period = {
  key: PeriodKey;
  label: string;
  from: string; // inclusivo
  to: string; // exclusivo
  plotTo: string; // exclusivo: no se grafican días futuros
  prevFrom: string;
  prevTo: string; // mismo número de días transcurridos, para comparar parejo
  granularity: "day" | "month";
  elapsedDays: number;
};

export type DashboardRow = {
  type: TransactionType;
  amount_cents: number;
  occurred_on: string;
  category_id: string;
  category_name: string;
  category_color: string | null;
  category_is_active: boolean;
};

// Egresos = dinero que deja de estar disponible: gastos + aportes a inversiones.
export const OUTFLOW_TYPES: TransactionType[] = ["expense", "invest"];

// ---------- fechas (YYYY-MM-DD, aritmética en UTC para no depender de la zona) ----------

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "UTC" });

// ---------- período ----------

export function resolvePeriod(params: Record<string, string | string[] | undefined>, today: string): Period {
  const get = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const thisMonth = `${today.slice(0, 7)}-01`;
  let key = (get("periodo") as PeriodKey) ?? "mes";
  let from: string;
  let to: string;
  let label: string;

  switch (key) {
    case "3m":
    case "6m": {
      const n = key === "3m" ? 3 : 6;
      from = addMonths(thisMonth, -(n - 1));
      to = addMonths(thisMonth, 1);
      label = `Últimos ${n} meses`;
      break;
    }
    case "anio":
      from = `${today.slice(0, 4)}-01-01`;
      to = `${Number(today.slice(0, 4)) + 1}-01-01`;
      label = `Año ${today.slice(0, 4)}`;
      break;
    case "rango": {
      const desde = get("desde");
      const hasta = get("hasta");
      if (isDay(desde) && isDay(hasta) && desde <= hasta) {
        from = desde;
        to = addDays(hasta, 1);
        label = `${shortDate(desde)} – ${shortDate(hasta)}`;
        break;
      }
      key = "mes"; // rango inválido: vuelve al mes actual
    }
    // falls through
    default: {
      key = "mes";
      const mes = get("mes");
      const month = isMonth(mes) ? mes : today.slice(0, 7);
      from = `${month}-01`;
      to = addMonths(from, 1);
      label = formatMonth(month);
    }
  }

  const tomorrow = addDays(today, 1);
  const plotTo = to < tomorrow ? to : tomorrow < from ? from : tomorrow;
  const elapsedDays = Math.max(daysBetween(from, plotTo), 0);
  const length = daysBetween(from, to);
  // El período anterior tiene el mismo largo; si es un mes calendario, es el mes anterior.
  const prevFrom = key === "mes" ? addMonths(from, -1) : key === "anio" ? addMonths(from, -12) : addDays(from, -length);
  const prevTo = addDays(prevFrom, elapsedDays) < from ? addDays(prevFrom, elapsedDays) : from;

  return {
    key,
    label,
    from,
    to,
    plotTo,
    prevFrom,
    prevTo,
    granularity: length <= 62 ? "day" : "month",
    elapsedDays,
  };
}

// ---------- totales ----------

export function summarize(rows: DashboardRow[]) {
  const sum = (t: TransactionType) => rows.filter((r) => r.type === t).reduce((s, r) => s + r.amount_cents, 0);
  const income = sum("income");
  const expense = sum("expense");
  const invested = sum("invest");
  return { income, expense, invested, outflow: expense + invested, balance: income - expense - invested };
}

export function inRange(rows: DashboardRow[], from: string, to: string) {
  return rows.filter((r) => r.occurred_on >= from && r.occurred_on < to);
}

// Variación porcentual; null si no hay base para comparar.
export function change(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// ---------- por categoría ----------

export type CategorySlice = {
  id: string;
  name: string;
  color: string | null;
  isActive: boolean;
  cents: number;
  pct: number;
};

export function outflowByCategory(rows: DashboardRow[]): CategorySlice[] {
  const map = new Map<string, CategorySlice>();
  for (const r of rows) {
    if (!OUTFLOW_TYPES.includes(r.type)) continue;
    const slice = map.get(r.category_id) ?? {
      id: r.category_id,
      name: r.category_name,
      color: r.category_color,
      isActive: r.category_is_active,
      cents: 0,
      pct: 0,
    };
    slice.cents += r.amount_cents;
    map.set(r.category_id, slice);
  }
  const total = [...map.values()].reduce((s, c) => s + c.cents, 0);
  return [...map.values()]
    .map((c) => ({ ...c, pct: total ? (c.cents / total) * 100 : 0 }))
    .sort((a, b) => b.cents - a.cents);
}

// Las N categorías más grandes y el resto agrupado en "Otras" (nunca más de 8 colores).
export const OTHER_ID = "__otras__";

export function topWithOther(slices: CategorySlice[], n: number): CategorySlice[] {
  if (slices.length <= n + 1) return slices;
  const rest = slices.slice(n);
  return [
    ...slices.slice(0, n),
    {
      id: OTHER_ID,
      name: `Otras (${rest.length})`,
      color: null,
      isActive: true,
      cents: rest.reduce((s, c) => s + c.cents, 0),
      pct: rest.reduce((s, c) => s + c.pct, 0),
    },
  ];
}

// ---------- serie de tiempo ----------

export type TrendPoint = { key: string; label: string; total: number } & Record<string, number | string>;

export function outflowTrend(rows: DashboardRow[], period: Period, seriesIds: string[]): TrendPoint[] {
  const bucketOf = (iso: string) => (period.granularity === "day" ? iso : iso.slice(0, 7));

  // Todos los buckets del rango, incluso los que no tienen movimientos (valen 0).
  const points = new Map<string, TrendPoint>();
  for (let d = period.from; d < period.plotTo; d = period.granularity === "day" ? addDays(d, 1) : addMonths(d, 1)) {
    const key = bucketOf(d);
    const label =
      period.granularity === "day"
        ? shortDate(d)
        : new Date(`${d}T12:00:00Z`).toLocaleDateString("es-PE", { month: "short", year: "2-digit", timeZone: "UTC" });
    const point: TrendPoint = { key, label, total: 0 };
    for (const id of seriesIds) point[id] = 0;
    points.set(key, point);
  }

  for (const r of rows) {
    if (!OUTFLOW_TYPES.includes(r.type)) continue;
    const point = points.get(bucketOf(r.occurred_on));
    if (!point) continue;
    point.total += r.amount_cents;
    const series = seriesIds.includes(r.category_id) ? r.category_id : OTHER_ID;
    if (series in point) point[series] = (point[series] as number) + r.amount_cents;
  }
  return [...points.values()];
}
