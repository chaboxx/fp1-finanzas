import { addDays, type Params, type TrendPoint } from "./dashboard";

const selectionKeys = ["categoria", "cuenta", "tipo", "buscar"] as const;

export function hasSelectionFilters(params: Params) {
  return selectionKeys.some((key) => {
    const value = params[key];
    return (Array.isArray(value) ? value : [value]).some((item) =>
      Boolean(item?.trim()),
    );
  });
}

export function clearSelectionFilters(params: Params): Params {
  const next = { ...params };
  for (const key of selectionKeys) delete next[key];
  return next;
}

export function queryString(
  params: Params,
  changes: Record<string, string | string[] | null | undefined> = {},
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...changes })) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item) query.append(key, item);
    }
  }
  return query.toString();
}

export function dateRangeChanges(from: string, to: string) {
  return { periodo: "rango", desde: from, hasta: to, mes: null, anio: null };
}

// Los intervalos usan fin exclusivo; el filtro visible incluye el último día.
export function rangeFromTrend(
  points: Pick<TrendPoint, "key" | "end">[],
  first: number,
  last: number,
) {
  if (!Number.isInteger(first) || !Number.isInteger(last)) return null;
  const start = points[Math.min(first, last)];
  const end = points[Math.max(first, last)];
  if (!start || !end) return null;
  return { from: start.key, to: addDays(end.end, -1) };
}
