import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  change,
  inRange,
  outflowByCategory,
  outflowTrend,
  OTHER_ID,
  resolvePeriod,
  summarize,
  topWithOther,
  type DashboardRow,
} from "./dashboard";
import { parseToCents } from "./money";

const TODAY = "2026-10-24";

const row = (
  type: DashboardRow["type"],
  cents: number,
  day: string,
  cat = "comida",
): DashboardRow => ({
  type,
  amount_cents: cents,
  occurred_on: day,
  category_id: cat,
  category_name: cat,
  category_color: null,
  category_is_active: true,
});

describe("resolvePeriod", () => {
  it("por defecto es el mes actual, sin graficar días futuros", () => {
    const p = resolvePeriod({}, TODAY);
    assert.equal(p.key, "mes");
    assert.equal(p.from, "2026-10-01");
    assert.equal(p.to, "2026-11-01");
    assert.equal(p.plotTo, "2026-10-25");
    assert.equal(p.elapsedDays, 24);
    assert.equal(p.granularity, "day");
  });

  it("compara contra los mismos días del mes anterior", () => {
    const p = resolvePeriod({}, TODAY);
    assert.equal(p.prevFrom, "2026-09-01");
    assert.equal(p.prevTo, "2026-09-25");
  });

  it("un mes pasado se compara completo y no se pasa del inicio del período", () => {
    const p = resolvePeriod({ mes: "2026-03" }, TODAY);
    assert.equal(p.plotTo, "2026-04-01");
    assert.equal(p.prevFrom, "2026-02-01");
    assert.equal(p.prevTo, "2026-03-01"); // febrero tiene 28 días: se recorta
  });

  it("últimos 3 meses agrupa por mes", () => {
    const p = resolvePeriod({ periodo: "3m" }, TODAY);
    assert.equal(p.from, "2026-08-01");
    assert.equal(p.to, "2026-11-01");
    assert.equal(p.granularity, "month");
  });

  it("año actual", () => {
    const p = resolvePeriod({ periodo: "anio" }, TODAY);
    assert.equal(p.from, "2026-01-01");
    assert.equal(p.prevFrom, "2025-01-01");
  });

  it("rango personalizado incluye el día final", () => {
    const p = resolvePeriod(
      { periodo: "rango", desde: "2026-10-01", hasta: "2026-10-10" },
      TODAY,
    );
    assert.equal(p.from, "2026-10-01");
    assert.equal(p.to, "2026-10-11");
    assert.equal(p.prevFrom, "2026-09-21");
    assert.equal(p.prevTo, "2026-10-01");
  });

  it("rango inválido vuelve al mes actual", () => {
    const p = resolvePeriod(
      { periodo: "rango", desde: "2026-10-10", hasta: "2026-10-01" },
      TODAY,
    );
    assert.equal(p.key, "mes");
    assert.equal(p.from, "2026-10-01");
  });
});

describe("totales", () => {
  const rows = [
    row("income", 800000, "2026-10-01", "sueldo"),
    row("expense", 1500, "2026-10-02"),
    row("expense", 3000, "2026-10-03", "ocio"),
    row("invest", 100000, "2026-10-05", "fondos"),
    row("expense", 999, "2026-09-30"),
  ];

  it("separa ingresos, gastos e inversión; el balance descuenta ambos egresos", () => {
    const s = summarize(inRange(rows, "2026-10-01", "2026-11-01"));
    assert.deepEqual(s, {
      income: 800000,
      expense: 4500,
      invested: 100000,
      divested: 0,
      outflow: 104500,
      balance: 695500,
    });
  });

  it("variación porcentual", () => {
    assert.equal(change(150, 100), 50);
    assert.equal(change(50, 100), -50);
    assert.equal(change(100, 0), null);
  });

  it("los egresos por categoría incluyen inversión y suman 100%", () => {
    const slices = outflowByCategory(inRange(rows, "2026-10-01", "2026-11-01"));
    assert.deepEqual(
      slices.map((s) => s.id),
      ["fondos", "ocio", "comida"],
    );
    assert.equal(Math.round(slices.reduce((s, c) => s + c.pct, 0)), 100);
  });

  it("agrupa las categorías pequeñas en Otras", () => {
    const slices = ["a", "b", "c", "d", "e"].map((id, i) => ({
      id,
      name: id,
      color: null,
      isActive: true,
      cents: 50 - i * 10,
      pct: 0,
    }));
    const top = topWithOther(slices, 3);
    assert.equal(top.length, 4);
    assert.equal(top[3].id, OTHER_ID);
    assert.equal(top[3].cents, 20 + 10);
  });
});

describe("outflowTrend", () => {
  it("rellena con 0 los días sin movimientos y separa por categoría", () => {
    const p = resolvePeriod(
      { periodo: "rango", desde: "2026-10-01", hasta: "2026-10-03" },
      TODAY,
    );
    const rows = [
      row("expense", 1000, "2026-10-01"),
      row("expense", 500, "2026-10-03", "ocio"),
      row("income", 9999, "2026-10-02"),
    ];
    const trend = outflowTrend(rows, p, ["comida", OTHER_ID]);
    assert.deepEqual(
      trend.map((t) => t.total),
      [1000, 0, 500],
    );
    assert.deepEqual(
      trend.map((t) => t.comida),
      [1000, 0, 0],
    );
    assert.deepEqual(
      trend.map((t) => t[OTHER_ID]),
      [0, 0, 500],
    );
  });
});

describe("parseToCents", () => {
  it("acepta montos sin signo con punto decimal", () => {
    assert.equal(parseToCents("1500.50"), 150050);
    assert.equal(parseToCents("15.5"), 1550);
    assert.equal(parseToCents("20"), 2000);
    assert.equal(parseToCents("abc"), null);
  });
});

describe("withDistinctColors", () => {
  it("las repetidas toman un color libre sin quitárselo a otra categoría", async () => {
    const { withDistinctColors } = await import("./colors");
    const out = withDistinctColors([
      { id: "a", color: "#2a78d6" },
      { id: "b", color: "#2a78d6" },
      { id: "c", color: "#eb6834" },
      { id: "o", color: null },
    ]);
    assert.deepEqual(
      out.map((i) => i.color),
      ["#2a78d6", "#1baf7a", "#eb6834", null],
    );
  });
});
