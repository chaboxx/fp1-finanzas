// Métricas de avance: ¿voy por buen camino este mes?
// Funciones puras (sin Supabase ni React) para poder probarlas con números.
import { addDays, addMonths, daysBetween, type DashboardRow } from "./dashboard";
import type { TransactionType } from "./types";

export type Status = "good" | "warning" | "bad" | "none";

// ---------- metas ----------

export type Targets = {
  savingsRateBps: number; // 2000 = 20 %
  monthlyInvestmentCents: number; // 0 = sin meta
  emergencyMonths: number;
};

export const DEFAULT_TARGETS: Targets = {
  savingsRateBps: 2000,
  monthlyInvestmentCents: 0,
  emergencyMonths: 6,
};

export type TargetRow = {
  effective_month: string; // YYYY-MM-01
  savings_rate_bps: number;
  monthly_investment_cents: number;
  emergency_months: number;
};

// La meta vigente para un mes es la última definida en ese mes o antes.
export function targetsFor(month: string, rows: TargetRow[]): Targets & { effectiveMonth: string | null } {
  const row = rows
    .filter((r) => r.effective_month.slice(0, 7) <= month)
    .sort((a, b) => b.effective_month.localeCompare(a.effective_month))[0];
  if (!row) return { ...DEFAULT_TARGETS, effectiveMonth: null };
  return {
    savingsRateBps: row.savings_rate_bps,
    monthlyInvestmentCents: Number(row.monthly_investment_cents),
    emergencyMonths: row.emergency_months,
    effectiveMonth: row.effective_month.slice(0, 7),
  };
}

// ---------- el mes que se evalúa ----------

export type MonthContext = {
  month: string; // YYYY-MM
  from: string; // primer día
  to: string; // primer día del mes siguiente (exclusivo)
  today: string;
  daysInMonth: number;
  elapsedDays: number; // días transcurridos, contando hoy
  remainingDays: number;
  closed: boolean; // el mes ya terminó
  future: boolean;
};

export function monthContext(month: string, today: string): MonthContext {
  const from = month + "-01";
  const to = addMonths(from, 1);
  const daysInMonth = daysBetween(from, to);
  const future = today < from;
  const closed = today >= to;
  const elapsedDays = closed ? daysInMonth : future ? 0 : daysBetween(from, today) + 1;
  return { month, from, to, today, daysInMonth, elapsedDays, remainingDays: daysInMonth - elapsedDays, closed, future };
}

// ---------- proyección al cierre del mes ----------

type Flow = Pick<DashboardRow, "type" | "amount_cents" | "occurred_on">;

export type Projection = Record<"income" | "expense" | "invest" | "divest", { actual: number; projected: number }> & {
  early: boolean; // primeros días: la extrapolación es poco confiable
};

/**
 * actual    = lo ejecutado hasta hoy.
 * projected = actual + lo ya programado (movimientos con fecha futura y recurrentes
 *             que aún no se generan) + para gastos variables, el ritmo diario
 *             extrapolado a los días que faltan.
 * Los gastos fijos (recurrentes) no se extrapolan: la renta del día 1 no implica
 * pagar renta todos los días.
 */
export function projectMonth(
  rows: Flow[], // movimientos del mes (incluye futuros registrados)
  recurringToDate: Flow[], // los de rows que generó una regla recurrente (hasta hoy)
  upcomingRecurring: Flow[], // ocurrencias de reglas que aún no existen como movimiento
  ctx: MonthContext,
): Projection {
  const inMonth = (r: Flow) => r.occurred_on >= ctx.from && r.occurred_on < ctx.to;
  const sum = (list: Flow[], type: TransactionType) =>
    list.filter((r) => r.type === type && inMonth(r)).reduce((s, r) => s + r.amount_cents, 0);
  const done = rows.filter((r) => r.occurred_on <= ctx.today);
  const scheduled = rows.filter((r) => r.occurred_on > ctx.today).concat(upcomingRecurring);

  const line = (type: "income" | "expense" | "invest" | "divest") => {
    const actual = sum(done, type);
    if (ctx.closed) return { actual, projected: actual };
    let projected = actual + sum(scheduled, type);
    if (type === "expense" && ctx.elapsedDays > 0) {
      const variable = Math.max(actual - sum(recurringToDate, type), 0);
      projected += Math.round((variable / ctx.elapsedDays) * ctx.remainingDays);
    }
    return { actual, projected };
  };

  return {
    income: line("income"),
    expense: line("expense"),
    invest: line("invest"),
    divest: line("divest"),
    early: !ctx.closed && ctx.elapsedDays < 7,
  };
}

// ---------- indicadores ----------

export type SavingsMetric = {
  status: Status;
  rate: number | null; // proporción (0.27 = 27 %)
  saved: number;
  income: number;
  expense: number;
  investedShare: number | null; // de lo ahorrado, cuánto se invirtió (neto)
  target: number;
};

// Invertir es ahorrar: aquí solo restan los gastos de consumo.
export function savingsMetric(p: Projection, targets: Targets): SavingsMetric {
  const income = p.income.projected;
  const expense = p.expense.projected;
  const saved = income - expense;
  const target = targets.savingsRateBps / 10000;
  const netInvested = p.invest.projected - p.divest.projected;
  if (income <= 0) {
    return { status: "none", rate: null, saved, income, expense, investedShare: null, target };
  }
  const rate = saved / income;
  const status: Status = rate >= target ? "good" : rate >= 0 ? "warning" : "bad";
  return {
    status,
    rate,
    saved,
    income,
    expense,
    investedShare: saved > 0 ? Math.max(netInvested, 0) / saved : null,
    target,
  };
}

export type BudgetMetric = {
  status: Status;
  budget: number | null;
  actual: number; // egresos (gasto + aportes) hasta hoy
  projected: number;
  usedPct: number | null; // actual / presupuesto
  projectedPct: number | null;
  elapsedPct: number;
  exceededCategories: number;
};

// El presupuesto cubre egresos: gastos + aportes a inversiones (decisión del usuario).
export function budgetMetric(
  p: Projection,
  budgetTotal: number | null,
  ctx: MonthContext,
  exceededCategories = 0,
): BudgetMetric {
  const actual = p.expense.actual + p.invest.actual;
  const projected = p.expense.projected + p.invest.projected;
  const elapsedPct = ctx.elapsedDays / ctx.daysInMonth;
  if (!budgetTotal) {
    return { status: "none", budget: null, actual, projected, usedPct: null, projectedPct: null, elapsedPct, exceededCategories };
  }
  const projectedPct = projected / budgetTotal;
  const status: Status = ctx.closed
    ? actual <= budgetTotal
      ? "good"
      : "bad"
    : projectedPct <= 1
      ? "good"
      : projectedPct <= 1.1
        ? "warning"
        : "bad";
  return {
    status,
    budget: budgetTotal,
    actual,
    projected,
    usedPct: actual / budgetTotal,
    projectedPct,
    elapsedPct,
    exceededCategories,
  };
}

export type InvestmentMetric = {
  status: Status;
  target: number;
  actual: number; // aportes netos (aportes − rescates) hasta hoy
  scheduled: number; // aportes netos ya programados para el resto del mes
  missing: number;
};

// Se mide la disciplina (aportar lo planeado), no el rendimiento del mercado.
export function investmentMetric(p: Projection, targets: Targets, ctx: MonthContext): InvestmentMetric {
  const target = targets.monthlyInvestmentCents;
  const actual = p.invest.actual - p.divest.actual;
  const projected = p.invest.projected - p.divest.projected;
  const scheduled = projected - actual;
  const missing = Math.max(target - projected, 0);
  if (target <= 0) return { status: "none", target, actual, scheduled, missing: 0 };
  const status: Status = projected >= target ? "good" : ctx.closed ? "bad" : "warning";
  return { status, target, actual, scheduled, missing };
}

export type EmergencyMetric = {
  status: Status;
  liquid: number;
  monthlyExpense: number;
  months: number | null;
  target: number;
  missing: number; // soles que faltan para la meta
};

export function emergencyMetric(liquid: number, monthlyExpense: number, targets: Targets): EmergencyMetric {
  const target = targets.emergencyMonths;
  if (monthlyExpense <= 0) {
    return { status: "none", liquid, monthlyExpense, months: null, target, missing: 0 };
  }
  const months = liquid / monthlyExpense;
  const status: Status = months >= target ? "good" : months >= target / 2 ? "warning" : "bad";
  return { status, liquid, monthlyExpense, months, target, missing: Math.max(Math.round(target * monthlyExpense - liquid), 0) };
}

// ---------- historial mensual (vista monthly_summary) ----------

export type MonthSummary = {
  month: string; // YYYY-MM
  income: number;
  expense: number;
  invested: number;
  divested: number;
};

// Gasto mensual de referencia: promedio de los últimos 3 meses cerrados con datos.
export function averageMonthlyExpense(history: MonthSummary[], currentMonth: string): number {
  const closed = history
    .filter((m) => m.month < currentMonth && (m.income || m.expense || m.invested))
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 3);
  if (!closed.length) return 0;
  return Math.round(closed.reduce((s, m) => s + m.expense, 0) / closed.length);
}

export type MonthResult = MonthSummary & {
  savingsRate: number | null;
  savingsMet: boolean | null; // null = sin ingresos
  investmentTarget: number;
  investmentMet: boolean | null; // null = sin meta
};

export function evaluateHistory(history: MonthSummary[], targetRows: TargetRow[]): MonthResult[] {
  return [...history]
    .sort((a, b) => b.month.localeCompare(a.month))
    .map((m) => {
      const t = targetsFor(m.month, targetRows);
      const savingsRate = m.income > 0 ? (m.income - m.expense) / m.income : null;
      return {
        ...m,
        savingsRate,
        savingsMet: savingsRate === null ? null : savingsRate >= t.savingsRateBps / 10000,
        investmentTarget: t.monthlyInvestmentCents,
        investmentMet: t.monthlyInvestmentCents > 0 ? m.invested - m.divested >= t.monthlyInvestmentCents : null,
      };
    });
}

// Meses cerrados seguidos (del más reciente hacia atrás) cumpliendo la meta.
export function streak(results: MonthResult[], key: "savingsMet" | "investmentMet", currentMonth: string): number {
  let count = 0;
  for (const r of results.filter((r) => r.month < currentMonth)) {
    if (r[key] !== true) break;
    count++;
  }
  return count;
}

// ---------- comparaciones por categoría ----------

export type CategoryChange = {
  id: string;
  name: string;
  color: string | null;
  current: number;
  average: number; // promedio de los meses anteriores a la misma altura del mes
  diff: number;
  pct: number | null; // null si antes no había gasto
};

type ChangeOptions = { months?: number; minPct?: number; minCents?: number; limit?: number };

/**
 * Compara el gasto de cada categoría con el promedio de los meses anteriores,
 * cortando cada mes en el mismo día (el día 10 contra los días 1–10), para no
 * comparar un mes a medias con meses completos. Solo cuentan los meses
 * anteriores que tienen algún movimiento.
 */
export function categoryChanges(rows: DashboardRow[], ctx: MonthContext, options: ChangeOptions = {}) {
  const { months = 3, minPct = 15, minCents = 5000, limit = 3 } = options;
  const cutoffDay = ctx.closed ? 31 : ctx.elapsedDays;
  const expenses = rows.filter((r) => r.type === "expense");

  const windowOf = (monthStart: string) => {
    const end = addMonths(monthStart, 1);
    const cut = addDays(monthStart, cutoffDay);
    return { from: monthStart, to: cut < end ? cut : end };
  };
  const totalsIn = (w: { from: string; to: string }) => {
    const map = new Map<string, number>();
    for (const r of expenses) {
      if (r.occurred_on >= w.from && r.occurred_on < w.to) map.set(r.category_id, (map.get(r.category_id) ?? 0) + r.amount_cents);
    }
    return map;
  };

  const current = totalsIn(windowOf(ctx.from));
  const previous = Array.from({ length: months }, (_, i) => addMonths(ctx.from, -(i + 1)))
    .filter((start) => rows.some((r) => r.occurred_on >= start && r.occurred_on < addMonths(start, 1)))
    .map((start) => totalsIn(windowOf(start)));

  const info = new Map(expenses.map((r) => [r.category_id, { name: r.category_name, color: r.category_color }]));
  const ids = new Set([...current.keys(), ...previous.flatMap((m) => [...m.keys()])]);

  const all: CategoryChange[] = [...ids].map((id) => {
    const now = current.get(id) ?? 0;
    const average = previous.length ? Math.round(previous.reduce((s, m) => s + (m.get(id) ?? 0), 0) / previous.length) : 0;
    const diff = now - average;
    return { id, name: info.get(id)?.name ?? "—", color: info.get(id)?.color ?? null, current: now, average, diff, pct: average ? (diff / average) * 100 : null };
  });
  all.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const sum = (key: "current" | "average") => all.reduce((s, c) => s + c[key], 0);
  const total = { current: sum("current"), average: sum("average") };

  // Destacados: cambios grandes en % y en soles a la vez (evita "+200 %" por S/ 10).
  const highlights = previous.length
    ? all
        .filter((c) => Math.abs(c.diff) >= minCents && (c.pct === null ? c.current >= minCents : Math.abs(c.pct) >= minPct))
        .slice(0, limit)
    : [];

  return {
    comparedMonths: previous.length,
    all,
    highlights,
    total: { ...total, pct: total.average ? ((total.current - total.average) / total.average) * 100 : null },
  };
}

// ---------- recurrentes pendientes del mes ----------

export type RuleForProjection = {
  type: TransactionType;
  amount_cents: number;
  start_on: string;
  end_on: string | null;
  frequency: "weekly" | "monthly" | "yearly";
  occurrence_index: number;
  is_active: boolean;
};

// Ocurrencias de reglas activas que caen después de hoy y dentro del mes:
// todavía no existen como movimiento, pero ya sabemos que vendrán.
export function upcomingOccurrences(
  rules: RuleForProjection[],
  ctx: MonthContext,
  dateOf: (start: string, frequency: RuleForProjection["frequency"], index: number) => string,
): Flow[] {
  if (ctx.closed) return [];
  const result: Flow[] = [];
  for (const rule of rules.filter((r) => r.is_active)) {
    for (let i = rule.occurrence_index, guard = 0; guard < 60; i++, guard++) {
      const day = dateOf(rule.start_on, rule.frequency, i);
      if (day >= ctx.to || (rule.end_on && day > rule.end_on)) break;
      if (day > ctx.today && day >= ctx.from) result.push({ type: rule.type, amount_cents: Number(rule.amount_cents), occurred_on: day });
    }
  }
  return result;
}
