import { Icon, type IconName } from "@/components/icons";
import { Card } from "@/components/ui";
import { formatMonth } from "@/lib/dates";
import type { categoryChanges, MonthResult, Status } from "@/lib/metrics";
import { formatCents } from "@/lib/money";

const percentFormat = new Intl.NumberFormat("es-PE", { style: "percent", maximumFractionDigits: 0 });
export const percent = (ratio: number) => percentFormat.format(ratio);

// Estado = ícono + texto + color (nunca solo color).
const STATUS: Record<Status, { icon: IconName; open: string; closed: string; pill: string; bar: string }> = {
  good: {
    icon: "check",
    open: "En camino",
    closed: "Cumplido",
    pill: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    bar: "bg-emerald-500",
  },
  warning: {
    icon: "alert",
    open: "Atención",
    closed: "Cerca",
    pill: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    bar: "bg-amber-500",
  },
  bad: {
    icon: "alert",
    open: "Fuera de meta",
    closed: "No cumplido",
    pill: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
    bar: "bg-rose-500",
  },
  none: {
    icon: "more",
    open: "Sin datos",
    closed: "Sin datos",
    pill: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    bar: "bg-slate-400",
  },
};

export function StatusPill({ status, closed }: { status: Status; closed: boolean }) {
  const s = STATUS[status];
  return (
    <span className={"inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap " + s.pill}>
      <Icon name={s.icon} size={14} />
      {closed ? s.closed : s.open}
    </span>
  );
}

type IndicatorProps = {
  title: string;
  question: string;
  status: Status;
  closed: boolean;
  value: string;
  valueNote?: string;
  children: React.ReactNode;
};

export function IndicatorCard({ title, question, status, closed, value, valueNote, children }: IndicatorProps) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{question}</p>
        </div>
        <StatusPill status={status} closed={closed} />
      </div>
      <p>
        <span className="metric-value">{value}</span>
        {valueNote && <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{valueNote}</span>}
      </p>
      <div className="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300 [&_strong]:text-slate-900 dark:[&_strong]:text-white">
        {children}
      </div>
    </Card>
  );
}

// Barra de avance: value y target en la misma unidad. marker = dónde "deberías" ir hoy.
// overIsBad: pasarse de la meta es malo (presupuesto) o bueno (ahorro, inversión, fondo).
export function ProgressBar({
  value,
  target,
  marker,
  label,
  overIsBad = false,
}: {
  value: number;
  target: number;
  marker?: number;
  label: string;
  overIsBad?: boolean;
}) {
  const scale = Math.max(target, value, marker ?? 0) || 1;
  const width = (n: number) => `${Math.min((n / scale) * 100, 100)}%`;
  const fill = value >= target ? (overIsBad && value > target ? "bg-rose-500" : overIsBad ? "bg-blue-600" : "bg-emerald-500") : "bg-blue-600";
  return (
    <div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="presentation">
        <div className={"h-full rounded-full " + fill} style={{ width: width(value) }} />
        {target < scale && <div className="absolute inset-y-0 w-0.5 bg-slate-900/60 dark:bg-white/70" style={{ left: width(target) }} />}
        {marker !== undefined && (
          <div className="absolute inset-y-0 w-0.5 bg-amber-500" style={{ left: width(marker) }} title="Dónde deberías ir hoy" />
        )}
      </div>
      <p className="mt-1 text-right text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

// ---------- lo que cambió ----------

type Changes = ReturnType<typeof categoryChanges>;

export function ChangesSection({ changes, closed }: { changes: Changes; closed: boolean }) {
  const when = closed ? "en el mes" : "a esta altura del mes";
  const months = changes.comparedMonths === 1 ? "tu mes anterior" : `tu promedio de los últimos ${changes.comparedMonths} meses`;
  return (
    <Card>
      <h2 className="font-semibold">Lo que cambió</h2>
      {changes.comparedMonths === 0 ? (
        <p className="muted mt-2">Necesito al menos un mes anterior con movimientos para comparar.</p>
      ) : (
        <>
          <p className="muted mt-1">
            Gastos {when} comparados con {months} {closed ? "" : "(cortados en el mismo día)"}.
          </p>
          <p className="mt-4 text-sm">
            Gasto total: <strong>{formatCents(changes.total.current)}</strong>{" "}
            {changes.total.pct === null ? "" : <ChangeText diff={changes.total.current - changes.total.average} pct={changes.total.pct} />}
            <span className="text-slate-500"> · promedio {formatCents(changes.total.average)}</span>
          </p>
          {changes.highlights.length === 0 ? (
            <p className="muted mt-3">Sin cambios grandes: tus categorías van parecido a tu promedio.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {changes.highlights.map((c) => (
                <li key={c.id} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
                  <span aria-hidden="true" className={c.diff > 0 ? "text-rose-600" : "text-emerald-600"}>
                    {c.diff > 0 ? "▲" : "▼"}
                  </span>
                  <span>
                    <strong>{c.name}</strong>: {formatCents(c.current)}
                    {c.pct === null ? (
                      <span>, sin gastos en tus meses anteriores.</span>
                    ) : (
                      <>
                        , <ChangeText diff={c.diff} pct={c.pct} /> {c.diff > 0 ? "sobre" : "bajo"} tu promedio.
                        {c.diff < 0 && " Bien."}
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-blue-600">Ver todas las categorías</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="py-2 font-medium">Categoría</th>
                    <th className="py-2 text-right font-medium">Este mes</th>
                    <th className="hidden py-2 text-right font-medium sm:table-cell">Promedio</th>
                    <th className="py-2 text-right font-medium">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.all.map((c) => (
                    <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-2">{c.name}</td>
                      <td className="py-2 text-right tabular-nums">{formatCents(c.current)}</td>
                      <td className="hidden py-2 text-right tabular-nums sm:table-cell">{formatCents(c.average)}</td>
                      <td className="py-2 text-right tabular-nums">
                        {c.diff > 0 ? "+" : c.diff < 0 ? "−" : ""}
                        {formatCents(Math.abs(c.diff))}
                        {c.pct !== null && <span className="text-slate-500"> ({Math.round(c.pct)} %)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </Card>
  );
}

function ChangeText({ diff, pct }: { diff: number; pct: number }) {
  const up = diff > 0;
  return (
    <span className={"font-semibold " + (up ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400")}>
      {up ? "+" : "−"}
      {Math.abs(Math.round(pct))} % ({up ? "+" : "−"}
      {formatCents(Math.abs(diff))})
    </span>
  );
}

// ---------- historial ----------

export function HistorySection({
  results,
  currentMonth,
  savingsStreak,
  investmentStreak,
}: {
  results: MonthResult[];
  currentMonth: string;
  savingsStreak: number;
  investmentStreak: number;
}) {
  const rows = results.filter((r) => r.month <= currentMonth).slice(0, 6);
  return (
    <Card>
      <h2 className="font-semibold">Historial</h2>
      <p className="muted mt-1">
        Racha de ahorro: {savingsStreak} {savingsStreak === 1 ? "mes" : "meses"} · Racha de inversión: {investmentStreak}{" "}
        {investmentStreak === 1 ? "mes" : "meses"}
      </p>
      {rows.length === 0 ? (
        <p className="muted mt-3">Todavía no hay meses con movimientos.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-2 font-medium">Mes</th>
                <th className="hidden py-2 text-right font-medium sm:table-cell">Ingresos</th>
                <th className="py-2 text-right font-medium">Gastos</th>
                <th className="py-2 text-right font-medium">Ahorro</th>
                <th className="py-2 text-right font-medium">Inversión neta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2">
                    {formatMonth(r.month)}
                    {r.month === currentMonth && <span className="ml-2 text-xs text-slate-500">en curso, a hoy</span>}
                  </td>
                  <td className="hidden py-2 text-right tabular-nums sm:table-cell">{formatCents(r.income)}</td>
                  <td className="py-2 text-right tabular-nums">{formatCents(r.expense)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {r.savingsRate === null ? "—" : percent(r.savingsRate)} <Met value={r.month === currentMonth ? null : r.savingsMet} />
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatCents(r.invested - r.divested)} <Met value={r.month === currentMonth ? null : r.investmentMet} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Met({ value }: { value: boolean | null }) {
  if (value === null) return <span className="inline-block w-5" />;
  return value ? (
    <span className="inline-flex w-5 justify-center text-emerald-600" title="Meta cumplida">
      <Icon name="check" size={14} />
      <span className="sr-only">Meta cumplida</span>
    </span>
  ) : (
    <span className="inline-flex w-5 justify-center text-rose-600" title="Meta no cumplida">
      ✕<span className="sr-only">Meta no cumplida</span>
    </span>
  );
}
