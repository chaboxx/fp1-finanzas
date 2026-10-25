import assert from "node:assert/strict";
import { it } from "node:test";
import { allocateCents, parsePercentage } from "./budget";
import { recurrenceDate } from "./recurrence";
import {
  resolvePeriod,
  outflowTrend,
  summarize,
  isDay,
  type DashboardRow,
} from "./dashboard";
import { parseToCents } from "./money";
import { fetchAll } from "./finance-data";
import { investmentResult } from "./investments";
const row = (
  day: string,
  type: DashboardRow["type"] = "expense",
  amount = 100,
): DashboardRow => ({
  occurred_on: day,
  type,
  amount_cents: amount,
  category_id: "food",
  category_name: "Comida",
  category_color: null,
  category_is_active: false,
});
it("el resultado de inversión excluye aportes posteriores a su valorización", () => {
  const value = { value_cents: 55000, valued_on: "2026-10-10" };
  const flows = [
    row("2026-10-01", "invest", 50000),
    row("2026-10-20", "invest", 20000),
  ];
  assert.equal(investmentResult(value, 0, flows), 5000);
  assert.equal(investmentResult(value, null, flows), null);
  assert.equal(investmentResult(undefined, 0, flows), null);
});
it("presupuesto de S/ 5000 al 30% asigna S/ 1500 y conserva céntimos enteros", () => {
  assert.equal(parsePercentage("30"), 3000);
  assert.equal(allocateCents(500000, 3000), 150000);
  assert.equal(parsePercentage("25,25"), 2525);
  assert.equal(parsePercentage("100.01"), null);
  assert.equal(parsePercentage("-1"), null);
  assert.equal(parsePercentage("1.234"), null);
  assert.equal(allocateCents(101, 3333), 33);
});
it("el dinero se convierte exactamente y rechaza enteros fuera de rango", () => {
  assert.equal(parseToCents("0.29"), 29);
  assert.equal(parseToCents("1,2.34"), null);
  assert.equal(parseToCents("1,2,3"), null);
  assert.equal(parseToCents("-15,50"), null);
  assert.equal(parseToCents("900719925474099.99"), null);
});
it("rescates y transferencias tienen su efecto sin duplicar egresos", () => {
  const s = summarize([
    row("2026-10-01", "income", 500000),
    row("2026-10-01", "expense", 100000),
    row("2026-10-01", "invest", 50000),
    row("2026-10-01", "divest", 10000),
    row("2026-10-01", "transfer", 90000),
  ]);
  assert.equal(s.outflow, 150000);
  assert.equal(s.balance, 360000);
  assert.equal(s.income, 500000);
});
it("elegir día en tres meses no cambia a agrupación mensual", () => {
  const p = resolvePeriod({ periodo: "3m", agrupacion: "day" }, "2026-10-24");
  assert.equal(p.granularity, "day");
  assert.equal(outflowTrend([], p, []).length, 85);
});
it("meses parciales no pierden el último tramo de la serie", () => {
  const p = resolvePeriod(
    {
      periodo: "rango",
      desde: "2026-01-31",
      hasta: "2026-03-02",
      agrupacion: "month",
    },
    "2026-10-24",
  );
  const points = outflowTrend(
    [row("2026-01-31"), row("2026-02-28"), row("2026-03-02")],
    p,
    [],
  );
  assert.deepEqual(
    points.map((p) => p.total),
    [100, 100, 100],
  );
  assert.equal(points[2].end, "2026-03-03");
});
it("las semanas empiezan en lunes y recortan los extremos del período", () => {
  const p = resolvePeriod(
    {
      periodo: "rango",
      desde: "2026-10-01",
      hasta: "2026-10-07",
      agrupacion: "week",
    },
    "2026-10-24",
  );
  const points = outflowTrend([row("2026-10-04"), row("2026-10-05")], p, []);
  assert.deepEqual(
    points.map((p) => p.total),
    [100, 100],
  );
  assert.equal(points[0].key, "2026-10-01");
  assert.equal(points[0].end, "2026-10-05");
});
it("los futuros no aparecen como ejecutados y los días sin gasto valen cero", () => {
  const p = resolvePeriod({ periodo: "mes" }, "2026-10-03");
  assert.deepEqual(
    outflowTrend([row("2026-10-01"), row("2026-10-05")], p, []).map(
      (p) => p.total,
    ),
    [100, 0, 0],
  );
});
it("las fechas inválidas no se normalizan a un día diferente", () => {
  assert.equal(isDay("2026-02-30"), false);
  assert.equal(isDay("2024-02-29"), true);
  assert.equal(isDay("2026-02-29"), false);
});
it("un año cerrado se compara completo y el año puede elegirse", () => {
  const p = resolvePeriod({ periodo: "anio", anio: "2024" }, "2026-10-24");
  assert.equal(p.from, "2024-01-01");
  assert.equal(p.prevFrom, "2023-01-01");
  assert.equal(p.prevTo, "2024-01-01");
});
it("recurrentes conservan el día original después de febrero", () => {
  assert.equal(recurrenceDate("2026-01-31", "monthly", 1), "2026-02-28");
  assert.equal(recurrenceDate("2026-01-31", "monthly", 2), "2026-03-31");
  assert.equal(recurrenceDate("2024-02-29", "yearly", 1), "2025-02-28");
  assert.equal(recurrenceDate("2024-02-29", "yearly", 4), "2028-02-29");
});
it("el informe supera incluso un límite del servidor menor al tamaño solicitado", async () => {
  const source = Array.from({ length: 1001 }, (_, i) => i);
  const all = await fetchAll(async (from, to) => ({
    data: source.slice(from, Math.min(to + 1, from + 17)),
    error: null,
  }));
  assert.equal(all.length, 1001);
  assert.equal(new Set(all).size, 1001);
});
