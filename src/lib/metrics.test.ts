import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DashboardRow } from "./dashboard";
import {
  averageMonthlyExpense,
  budgetMetric,
  categoryChanges,
  DEFAULT_TARGETS,
  emergencyMetric,
  evaluateHistory,
  investmentMetric,
  monthContext,
  projectMonth,
  savingsMetric,
  streak,
  targetsFor,
  upcomingOccurrences,
} from "./metrics";
import { recurrenceDate } from "./recurrence";

const row = (type: DashboardRow["type"], cents: number, day: string, cat = "ocio"): DashboardRow => ({
  type,
  amount_cents: cents,
  occurred_on: day,
  category_id: cat,
  category_name: cat === "ocio" ? "Entretenimiento" : cat,
  category_color: null,
  category_is_active: true,
});

describe("monthContext", () => {
  it("mes en curso cuenta hoy como transcurrido", () => {
    const c = monthContext("2026-10", "2026-10-24");
    assert.equal(c.daysInMonth, 31);
    assert.equal(c.elapsedDays, 24);
    assert.equal(c.remainingDays, 7);
    assert.equal(c.closed, false);
  });
  it("mes pasado está cerrado y completo", () => {
    const c = monthContext("2026-09", "2026-10-24");
    assert.equal(c.closed, true);
    assert.equal(c.elapsedDays, 30);
  });
});

describe("targetsFor", () => {
  const rows = [
    { effective_month: "2026-08-01", savings_rate_bps: 1000, monthly_investment_cents: 0, emergency_months: 3 },
    { effective_month: "2026-10-01", savings_rate_bps: 2500, monthly_investment_cents: 50000, emergency_months: 6 },
  ];
  it("usa la última meta definida en o antes del mes", () => {
    assert.equal(targetsFor("2026-09", rows).savingsRateBps, 1000);
    assert.equal(targetsFor("2026-12", rows).monthlyInvestmentCents, 50000);
  });
  it("sin metas usa los valores sugeridos", () => {
    assert.deepEqual({ ...targetsFor("2026-07", rows), effectiveMonth: undefined }, { ...DEFAULT_TARGETS, effectiveMonth: undefined });
  });
});

describe("projectMonth", () => {
  const ctx = monthContext("2026-10", "2026-10-10"); // 10 de 31 días
  it("no extrapola los gastos fijos: la renta del día 1 no se repite", () => {
    const rent = row("expense", 150000, "2026-10-01", "renta");
    const food = row("expense", 10000, "2026-10-05", "comida");
    const p = projectMonth([rent, food], [rent], [], ctx);
    // variable: S/ 100 en 10 días → S/ 10/día × 21 días restantes = S/ 210
    assert.equal(p.expense.actual, 160000);
    assert.equal(p.expense.projected, 160000 + 21000);
  });
  it("suma el sueldo recurrente que aún no llega y los movimientos con fecha futura", () => {
    const salaryLater = { type: "income" as const, amount_cents: 800000, occurred_on: "2026-10-30" };
    const futureExpense = row("expense", 5000, "2026-10-20");
    const p = projectMonth([futureExpense], [], [salaryLater], ctx);
    assert.equal(p.income.actual, 0);
    assert.equal(p.income.projected, 800000);
    assert.equal(p.expense.actual, 0);
    assert.equal(p.expense.projected, 5000);
  });
  it("en un mes cerrado lo proyectado es lo real", () => {
    const p = projectMonth([row("expense", 1000, "2026-09-03")], [], [], monthContext("2026-09", "2026-10-24"));
    assert.equal(p.expense.projected, 1000);
  });
});

describe("indicadores", () => {
  const ctx = monthContext("2026-10", "2026-10-24");
  const p = projectMonth(
    [row("income", 1000000, "2026-10-01", "sueldo"), row("expense", 700000, "2026-10-10"), row("invest", 100000, "2026-10-15", "fondos")],
    [],
    [],
    monthContext("2026-10", "2026-10-31"),
  );

  it("tasa de ahorro: invertir cuenta como ahorro, no como gasto", () => {
    const s = savingsMetric(p, DEFAULT_TARGETS);
    assert.equal(s.rate, 0.3);
    assert.equal(s.status, "good");
    assert.equal(s.investedShare, 1 / 3);
  });
  it("tasa de ahorro bajo la meta = atención; negativa = mal; sin ingresos = sin dato", () => {
    assert.equal(savingsMetric(p, { ...DEFAULT_TARGETS, savingsRateBps: 4000 }).status, "warning");
    const negative = projectMonth([row("income", 1000, "2026-10-01", "s"), row("expense", 2000, "2026-10-02")], [], [], ctx);
    assert.equal(savingsMetric(negative, DEFAULT_TARGETS).status, "bad");
    assert.equal(savingsMetric(projectMonth([], [], [], ctx), DEFAULT_TARGETS).status, "none");
  });
  it("presupuesto: cubre gasto + inversión y se juzga por la proyección", () => {
    assert.equal(budgetMetric(p, 800000, ctx).status, "good"); // 800,000 de 800,000
    assert.equal(budgetMetric(p, 750000, ctx).status, "warning"); // 106 %
    assert.equal(budgetMetric(p, 600000, ctx).status, "bad");
    assert.equal(budgetMetric(p, null, ctx).status, "none");
  });
  it("inversión: en curso falta = atención; mes cerrado sin cumplir = mal; sin meta = sin dato", () => {
    const t = { ...DEFAULT_TARGETS, monthlyInvestmentCents: 150000 };
    const m = investmentMetric(p, t, ctx);
    assert.equal(m.status, "warning");
    assert.equal(m.missing, 50000);
    assert.equal(investmentMetric(p, t, monthContext("2026-10", "2026-11-05")).status, "bad");
    assert.equal(investmentMetric(p, { ...t, monthlyInvestmentCents: 100000 }, ctx).status, "good");
    assert.equal(investmentMetric(p, DEFAULT_TARGETS, ctx).status, "none");
  });
  it("fondo de emergencia en meses de gasto", () => {
    const e = emergencyMetric(1200000, 300000, DEFAULT_TARGETS);
    assert.equal(e.months, 4);
    assert.equal(e.status, "warning");
    assert.equal(e.missing, 600000);
    assert.equal(emergencyMetric(2000000, 300000, DEFAULT_TARGETS).status, "good");
    assert.equal(emergencyMetric(500000, 300000, DEFAULT_TARGETS).status, "bad");
    assert.equal(emergencyMetric(500000, 0, DEFAULT_TARGETS).status, "none");
  });
});

describe("historial", () => {
  const history = [
    { month: "2026-07", income: 100, expense: 90, invested: 0, divested: 0 },
    { month: "2026-08", income: 100, expense: 70, invested: 20, divested: 0 },
    { month: "2026-09", income: 100, expense: 75, invested: 20, divested: 0 },
    { month: "2026-10", income: 0, expense: 30, invested: 0, divested: 0 },
  ];
  const targets = [{ effective_month: "2026-01-01", savings_rate_bps: 2000, monthly_investment_cents: 20, emergency_months: 6 }];
  it("racha de meses cerrados cumpliendo, sin contar el mes en curso", () => {
    const results = evaluateHistory(history, targets);
    assert.equal(streak(results, "savingsMet", "2026-10"), 2);
    assert.equal(streak(results, "investmentMet", "2026-10"), 2);
  });
  it("gasto promedio de los últimos 3 meses cerrados", () => {
    assert.equal(averageMonthlyExpense(history, "2026-10"), Math.round((90 + 70 + 75) / 3));
  });
});

describe("categoryChanges", () => {
  it("compara contra el promedio a la misma altura del mes y destaca solo cambios grandes", () => {
    const rows = [
      row("expense", 12000, "2026-10-05"), // octubre al día 10: S/ 120
      row("expense", 10000, "2026-09-03"), // septiembre al día 10: S/ 100
      row("expense", 99900, "2026-09-25"), // fuera de la ventana: no cuenta
      row("expense", 10000, "2026-08-08"), // agosto al día 10: S/ 100
      row("expense", 1000, "2026-10-02", "cafe"),
      row("expense", 300, "2026-09-02", "cafe"), // +233 % pero solo S/ 7: no se destaca
    ];
    const r = categoryChanges(rows, monthContext("2026-10", "2026-10-10"), { minCents: 1000 });
    const ocio = r.all.find((c) => c.id === "ocio")!;
    assert.equal(ocio.average, 10000);
    assert.equal(ocio.pct, 20);
    assert.equal(r.comparedMonths, 2);
    assert.deepEqual(r.highlights.map((c) => c.id), ["ocio"]);
  });
  it("una categoría sin historial se destaca si el monto es grande", () => {
    const rows = [row("expense", 1000, "2026-09-02", "otra"), row("expense", 20000, "2026-10-02", "viaje")];
    const r = categoryChanges(rows, monthContext("2026-10", "2026-10-10"));
    assert.equal(r.highlights[0].id, "viaje");
    assert.equal(r.highlights[0].pct, null);
  });
  it("febrero se corta en su último día", () => {
    const rows = [row("expense", 5000, "2026-02-28"), row("expense", 5000, "2026-03-30")];
    const r = categoryChanges(rows, monthContext("2026-03", "2026-03-30"));
    assert.equal(r.all[0].average, 5000);
  });
});

describe("upcomingOccurrences", () => {
  it("devuelve las ocurrencias que faltan en el mes, respetando la fecha fin", () => {
    const ctx = monthContext("2026-10", "2026-10-10");
    const weekly = { type: "expense" as const, amount_cents: 1000, start_on: "2026-10-01", end_on: null, frequency: "weekly" as const, occurrence_index: 2, is_active: true };
    const days = upcomingOccurrences([weekly], ctx, recurrenceDate).map((o) => o.occurred_on);
    assert.deepEqual(days, ["2026-10-15", "2026-10-22", "2026-10-29"]);
    const ended = { ...weekly, end_on: "2026-10-20" };
    assert.equal(upcomingOccurrences([ended], ctx, recurrenceDate).length, 1);
    assert.equal(upcomingOccurrences([{ ...weekly, is_active: false }], ctx, recurrenceDate).length, 0);
  });
});
