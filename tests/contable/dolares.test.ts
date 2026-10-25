// Dólares (docs/PLAN_USD.md): la moneda es de la cuenta y soles y dólares nunca se suman.
// Un mes con resultados calculados A MANO, en dos monedas.
//
// Junio 2025
//   Cuentas: BCP S/ 1,000.00 · Interbank US$ 500.00 · Visa USD (deuda) US$ 0.00
//   01  Sueldo            +S/ 5,000.00  BCP
//   02  Día a día         −S/ 2,000.00  BCP        (Comida)
//   10  Viaje               −US$ 100.00  Interbank  (Viajes)
//   11  Cena en el viaje     −US$ 30.00  Visa USD   (Comida, en dólares)
//   15  Pago Visa USD         US$ 30.00  Interbank → Visa USD (transferencia)
//   20  Aporte ETF          −US$ 100.00  Interbank  (inversión en dólares)
//   30  Valor del ETF        US$ 110.00
//
//   Saldos: BCP S/ 4,000.00 · Interbank US$ 270.00 · Visa USD US$ 0.00
//   Soles:   ingresos 5,000 · gastos 2,000 · aportes 0
//   Dólares: ingresos 0 · gastos 130 · aportes 100
//   Presupuesto (en soles) de Comida: ejecutado S/ 2,000 (la cena en dólares no cuenta)
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { before, describe, it } from "node:test";
import { saveMovement } from "@/app/(app)/movimientos/actions";
import { saveInvestment } from "@/app/(app)/inversiones/actions";
import { saveRecurring } from "@/app/(app)/movimientos/recurrentes/actions";
import { updateAccount } from "@/app/(app)/cuentas/actions";
import { summarize } from "@/lib/dashboard";
import { getBudgetData, getReportRows } from "@/lib/finance-data";
import { Persona } from "./app";
import { createTestDb, createUser, dbToday } from "./db";
import { createFakeClient } from "./fake-supabase";
import { cuadrar } from "./verificar";

const AUDITORIA = readFileSync(join(import.meta.dirname, "..", "..", "scripts", "auditoria.sql"), "utf8");

describe("Dólares: cuentas, gastos e inversiones separados de los soles", () => {
  let p: Persona;
  const id: Record<string, string> = {};

  before(async () => {
    const db = await createTestDb();
    p = new Persona(db, await createUser(db, "ana@ejemplo.com"), await dbToday(db));
    id.bcp = await p.crearCuenta("BCP", "debit", "1000");
    id.interbank = await p.crearCuenta("Interbank", "savings", "500", "USD");
    id.visa = await p.crearCuenta("Visa USD", "credit", "", "USD");
    id.sueldo = await p.crearCategoria("Sueldo", "income");
    id.comida = await p.crearCategoria("Comida", "expense");
    id.viajes = await p.crearCategoria("Viajes", "expense");
    id.etf = await p.crearCategoria("ETF", "investment");

    await p.registrar({ tipo: "income", monto: "5000", fecha: "2025-06-01", cuenta: id.bcp, categoria: id.sueldo });
    await p.registrar({ tipo: "expense", monto: "2000", fecha: "2025-06-02", cuenta: id.bcp, categoria: id.comida });
    await p.registrar({ tipo: "expense", monto: "100", fecha: "2025-06-10", cuenta: id.interbank, categoria: id.viajes });
    await p.registrar({ tipo: "expense", monto: "30", fecha: "2025-06-11", cuenta: id.visa, categoria: id.comida });
    await p.registrar({ tipo: "transfer", monto: "30", fecha: "2025-06-15", cuenta: id.interbank, hacia: id.visa });
    id.inversion = await p.invertir({
      operacion: "invest",
      monto: "100",
      categoria: id.etf,
      nombre: "ETF S&P 500",
      cuenta: id.interbank,
      fecha: "2025-06-20",
      moneda: "USD",
    });
    await p.invertir({ operacion: "valuation", monto: "110", inversion: id.inversion, fecha: "2025-06-30", moneda: "USD" });
    await p.presupuestar("2025-06", "4000", { [id.comida]: "60" });
  });

  const saldo = async (cuenta: string) =>
    (await p.sql<{ balance_cents: number; currency: string }>("select balance_cents, currency from account_balances where account_id = $1", [cuenta]))[0];

  it("cada cuenta tiene su saldo en su propia moneda", async () => {
    assert.deepEqual(await saldo(id.bcp), { balance_cents: 400000, currency: "PEN" });
    assert.deepEqual(await saldo(id.interbank), { balance_cents: 27000, currency: "USD" });
    assert.deepEqual(await saldo(id.visa), { balance_cents: 0, currency: "USD" });
  });

  it("la inversión queda en dólares", async () => {
    const [i] = await p.sql<{ currency: string }>("select currency from investments where id = $1", [id.inversion]);
    assert.equal(i.currency, "USD");
  });

  it("el resumen separa soles y dólares, nunca los suma", async () => {
    const rows = await getReportRows(createFakeClient(p.db, p.user.id) as never, "2025-06-01", "2025-07-01");
    const soles = summarize(rows.filter((r) => r.currency === "PEN"));
    const dolares = summarize(rows.filter((r) => r.currency === "USD"));
    assert.deepEqual([soles.income, soles.expense, soles.invested], [500000, 200000, 0]);
    assert.deepEqual([dolares.income, dolares.expense, dolares.invested], [0, 13000, 10000]);
    // Pedir una moneda devuelve solo esa (así leen Métricas y Presupuesto).
    const soloSoles = await getReportRows(createFakeClient(p.db, p.user.id) as never, "2025-06-01", "2025-07-01", "PEN");
    assert.ok(soloSoles.every((r) => r.currency === "PEN"));
    assert.equal(summarize(soloSoles).expense, 200000);

    const meses = await p.sql<{ currency: string; expense_cents: number; invested_cents: number | null }>(
      "select currency, expense_cents, invested_cents from monthly_summary where month = '2025-06-01' order by currency",
    );
    assert.deepEqual(meses, [
      { currency: "PEN", expense_cents: 200000, invested_cents: null },
      { currency: "USD", expense_cents: 13000, invested_cents: 10000 },
    ]);
  });

  it("el presupuesto en soles no cuenta los gastos en dólares", async () => {
    const budget = await getBudgetData(createFakeClient(p.db, p.user.id) as never, "2025-06");
    const comida = budget.allocations.find((a) => a.category_id === id.comida)!;
    assert.equal(Number(comida.spent_cents), 200000);
  });

  it("rechaza mezclar monedas sin mover un céntimo", async () => {
    const antes = await p.sql("select count(*)::int n, coalesce(sum(amount_cents),0)::bigint s from transactions");
    const rechazar = async (accion: Parameters<Persona["enviar"]>[0], campos: Record<string, string>, motivo: string, mensaje: RegExp) => {
      const r = await p.enviar(accion, { requestId: randomUUID(), ...campos });
      assert.ok(!r.ok, `${motivo}: debía rechazarse`);
      assert.match(r.error ?? Object.values(r.fieldErrors ?? {}).join(" "), mensaje, motivo);
    };
    await rechazar(
      saveMovement,
      { type: "transfer", currency: "PEN", amount: "10", description: "", accountId: id.bcp, toAccountId: id.interbank, occurredOn: "2025-06-16" },
      "transferencia de soles a dólares",
      /misma moneda/,
    );
    await rechazar(
      saveMovement,
      { type: "expense", currency: "USD", amount: "10", description: "", categoryId: id.comida, accountId: id.bcp, occurredOn: "2025-06-16" },
      "gasto en dólares en una cuenta en soles",
      /cuenta en dólares/,
    );
    await rechazar(
      saveMovement,
      { type: "expense", currency: "USD", amount: "10", description: "", categoryId: id.comida, accountId: "", occurredOn: "2025-06-16" },
      "gasto en dólares sin cuenta (la de defecto está en soles)",
      /cuenta en dólares/,
    );
    await rechazar(
      saveInvestment,
      {
        operation: "invest", currency: "USD", investmentId: id.inversion, categoryId: "", accountId: id.bcp, entryId: "",
        name: "", platform: "", description: "", date: "2025-06-21", amount: "10", initialCapital: "",
      },
      "aportar soles a una inversión en dólares",
      /misma moneda que la inversión/,
    );
    await rechazar(
      saveRecurring,
      {
        id: "", type: "expense", amount: "15", description: "Netflix", categoryId: id.comida, accountId: id.interbank,
        toAccountId: "", frequency: "monthly", start: "2025-06-01", end: "",
      },
      "recurrente en dólares",
      /cuentas en soles/,
    );
    await rechazar(
      updateAccount,
      { id: id.interbank, name: "Interbank", currency: "PEN", initialBalance: "500" },
      "cambiar la moneda de una cuenta con movimientos",
      /moneda de una cuenta/,
    );
    assert.deepEqual(await p.sql("select count(*)::int n, coalesce(sum(amount_cents),0)::bigint s from transactions"), antes);
    const [cuenta] = await p.sql<{ currency: string }>("select currency from accounts where id = $1", [id.interbank]);
    assert.equal(cuenta.currency, "USD");
  });

  it("el mensaje de éxito usa la moneda de la cuenta", async () => {
    const r = await p.enviar(saveMovement, {
      requestId: randomUUID(), type: "expense", currency: "USD", amount: "5", description: "", categoryId: id.viajes,
      accountId: id.interbank, occurredOn: "2025-06-29",
    });
    assert.ok(r.ok);
    assert.match(r.message ?? "", /US\$\s5\.00/);
    // Se anota en el Libro para que las invariantes sigan cuadrando.
    const [t] = await p.sql<{ id: string }>("select id from transactions where occurred_on = '2025-06-29'");
    p.libro.movimientos.set(t.id, { type: "expense", cents: 500, date: "2025-06-29", account: id.interbank, category: id.viajes });
  });

  it("todas las invariantes cuadran por moneda y la auditoría da OK", async () => {
    await cuadrar(p, "dólares");
    const filas = (await p.db.query<{ comprobacion: string; estado: string }>(AUDITORIA)).rows;
    assert.deepEqual(filas.filter((f) => f.estado === "REVISAR"), []);
  });
});
