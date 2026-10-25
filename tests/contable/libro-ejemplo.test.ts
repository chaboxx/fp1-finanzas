// Libro contable de ejemplo: un mes completo con resultados calculados A MANO.
// Si cambias algo y este test falla, la app ya no cuadra con una calculadora.
//
// Marzo 2025
//   Cuentas iniciales: Efectivo 200.00 · BCP 3,000.00 · Visa (deuda) 500.00 · Ahorro 10,000.00
//   01  Sueldo            +6,500.00  BCP
//   01  Renta             -1,800.00  BCP
//   05  Almuerzo             -45.50  (sin cuenta → Efectivo, la de defecto)
//   10  Cine                -120.00  Visa
//   15  Pago Visa            620.00  BCP → Visa   (transferencia, NO es gasto)
//   20  A mi ahorro        1,000.00  BCP → Ahorro (transferencia)
//   25  Aporte a Fondos     -500.00  BCP
//   28  Rescate de Fondos   +100.00  BCP
//
//   Saldos esperados: Efectivo 154.50 · BCP 5,680.00 · Visa 0.00 · Ahorro 11,000.00 → total 16,834.50
//   Comprobación: 12,700 inicial + 6,500 ingresos + 100 rescate − 1,965.50 gastos − 500 aporte = 16,834.50
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { summarize } from "@/lib/dashboard";
import { getBudgetData, getReportRows } from "@/lib/finance-data";
import { investmentResult } from "@/lib/investments";
import { monthContext, projectMonth, savingsMetric, budgetMetric, DEFAULT_TARGETS } from "@/lib/metrics";
import { Persona } from "./app";
import { createTestDb, createUser, dbToday } from "./db";
import { createFakeClient } from "./fake-supabase";

describe("Libro de ejemplo: marzo 2025 calculado a mano", () => {
  let p: Persona;
  const id: Record<string, string> = {};

  before(async () => {
    const db = await createTestDb();
    p = new Persona(db, await createUser(db, "ana@ejemplo.com"), await dbToday(db));

    id.efectivo = await p.crearCuenta("Efectivo", "cash", "200");
    id.bcp = await p.crearCuenta("BCP Débito", "debit", "3000.00");
    id.visa = await p.crearCuenta("Visa", "credit", "500");
    id.ahorro = await p.crearCuenta("Ahorro", "savings", "10000");

    id.sueldo = await p.crearCategoria("Sueldo", "income");
    id.comida = await p.crearCategoria("Comida", "expense");
    id.renta = await p.crearCategoria("Renta", "expense");
    id.ocio = await p.crearCategoria("Entretenimiento", "expense");
    id.fondos = await p.crearCategoria("Fondos mutuos", "investment");

    await p.registrar({ tipo: "income", monto: "6500.00", fecha: "2025-03-01", cuenta: id.bcp, categoria: id.sueldo, descripcion: "Sueldo" });
    await p.registrar({ tipo: "expense", monto: "1800", fecha: "2025-03-01", cuenta: id.bcp, categoria: id.renta, descripcion: "Renta" });
    await p.registrar({ tipo: "expense", monto: "45.50", fecha: "2025-03-05", categoria: id.comida, descripcion: "Almuerzo" });
    await p.registrar({ tipo: "expense", monto: "120", fecha: "2025-03-10", cuenta: id.visa, categoria: id.ocio, descripcion: "Cine" });
    await p.registrar({ tipo: "transfer", monto: "620", fecha: "2025-03-15", cuenta: id.bcp, hacia: id.visa, descripcion: "Pago Visa" });
    await p.registrar({ tipo: "transfer", monto: "1000", fecha: "2025-03-20", cuenta: id.bcp, hacia: id.ahorro, descripcion: "A mi ahorro" });
    id.inversion = await p.invertir({ operacion: "invest", monto: "500", categoria: id.fondos, nombre: "Fondo BCP", cuenta: id.bcp, fecha: "2025-03-25" });
    await p.invertir({ operacion: "divest", monto: "100", inversion: id.inversion, cuenta: id.bcp, fecha: "2025-03-28" });
    await p.invertir({ operacion: "valuation", monto: "420", inversion: id.inversion, fecha: "2025-03-31" });
    await p.presupuestar("2025-03", "4000", { [id.comida]: "10", [id.renta]: "50", [id.ocio]: "5", [id.fondos]: "20" });
  });

  const saldo = async (cuenta: string) =>
    (await p.sql<{ balance_cents: number }>("select balance_cents from account_balances where account_id = $1", [cuenta]))[0].balance_cents;

  it("cada cuenta tiene el saldo calculado a mano", async () => {
    assert.equal(await saldo(id.efectivo), 15450, "Efectivo: 200 − 45.50");
    assert.equal(await saldo(id.bcp), 568000, "BCP: 3,000 + 6,500 − 1,800 − 620 − 1,000 − 500 + 100");
    assert.equal(await saldo(id.visa), 0, "Visa: −500 − 120 + 620 (pagada completa)");
    assert.equal(await saldo(id.ahorro), 1100000, "Ahorro: 10,000 + 1,000");
  });

  it("el dinero total cuadra: nada aparece ni desaparece", async () => {
    const [{ total }] = await p.sql<{ total: number }>("select sum(balance_cents)::bigint total from account_balances");
    assert.equal(total, 1683450);
    assert.equal(1270000 + 650000 + 10000 - 196550 - 50000, 1683450);
  });

  it("las transferencias no cuentan como gasto ni como ingreso", async () => {
    const [m] = await p.sql<{ income_cents: number; expense_cents: number; invested_cents: number; divested_cents: number }>(
      "select * from monthly_summary where month = '2025-03-01'",
    );
    assert.deepEqual(
      { income: m.income_cents, expense: m.expense_cents, invested: m.invested_cents, divested: m.divested_cents },
      { income: 650000, expense: 196550, invested: 50000, divested: 10000 },
    );
  });

  it("el resumen que lee la app (getReportRows + summarize) da los mismos números", async () => {
    const rows = await getReportRows(createFakeClient(p.db, p.user.id) as never, "2025-03-01", "2025-04-01");
    const s = summarize(rows);
    assert.equal(s.income, 650000);
    assert.equal(s.expense, 196550);
    assert.equal(s.invested, 50000);
    assert.equal(s.divested, 10000);
    assert.equal(s.balance, 650000 + 10000 - 196550 - 50000);
  });

  it("el presupuesto suma gastos + aportes por categoría y reparte el total por porcentaje", async () => {
    const budget = await getBudgetData(createFakeClient(p.db, p.user.id) as never, "2025-03");
    const byCat = Object.fromEntries(budget.allocations.map((a) => [a.category_id, { budget: Number(a.budget_cents), spent: Number(a.spent_cents) }]));
    assert.deepEqual(byCat[id.comida], { budget: 40000, spent: 4550 });
    assert.deepEqual(byCat[id.renta], { budget: 200000, spent: 180000 });
    assert.deepEqual(byCat[id.ocio], { budget: 20000, spent: 12000 });
    assert.deepEqual(byCat[id.fondos], { budget: 80000, spent: 50000 }, "el aporte cuenta contra el presupuesto");
  });

  it("la inversión: aportado neto 400 y resultado +20 con la valorización de 420", async () => {
    assert.equal(p.libro.aportadoNeto(id.inversion), 40000);
    const movs = await p.sql<{ type: "invest" | "divest"; amount_cents: number; occurred_on: string }>(
      "select type, amount_cents, occurred_on from transactions where investment_id = $1",
      [id.inversion],
    );
    assert.equal(investmentResult({ value_cents: 42000, valued_on: "2025-03-31" }, 0, movs), 2000);
  });

  it("las métricas del mes cerrado salen de esos mismos números", async () => {
    const rows = await getReportRows(createFakeClient(p.db, p.user.id) as never, "2025-03-01", "2025-04-01");
    const ctx = monthContext("2025-03", p.libro.hoy);
    const proj = projectMonth(rows, [], [], ctx);
    const ahorro = savingsMetric(proj, DEFAULT_TARGETS);
    assert.equal(ahorro.saved, 650000 - 196550);
    assert.equal(Math.round(ahorro.rate! * 10000), 6976, "69.76 % de ahorro");
    const presupuesto = budgetMetric(proj, 400000, ctx);
    assert.equal(presupuesto.actual, 196550 + 50000, "presupuesto usa gasto + aporte");
    assert.equal(presupuesto.status, "good");
  });

  it("un movimiento sin fecha queda en HOY y uno con fecha futura no toca el saldo todavía", async () => {
    const antes = await saldo(id.efectivo);
    await p.registrar({ tipo: "expense", monto: "10", categoria: id.comida, descripcion: "Sin fecha" });
    assert.equal(await saldo(id.efectivo), antes - 1000);
    const [{ occurred_on }] = await p.sql<{ occurred_on: string }>("select occurred_on from transactions where description = 'Sin fecha'");
    assert.equal(occurred_on, p.libro.hoy);

    await p.registrar({ tipo: "expense", monto: "999", fecha: "2099-01-01", cuenta: id.efectivo, categoria: id.comida, descripcion: "Futuro" });
    assert.equal(await saldo(id.efectivo), antes - 1000, "un gasto programado a futuro aún no descuenta");
  });
});
