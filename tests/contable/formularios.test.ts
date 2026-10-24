// Formularios: lo que una persona puede escribir mal, hacer dos veces o intentar
// "a la mala". Regla de oro: si el formulario responde error, NO se movió ni un céntimo.
import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { saveMovement } from "@/app/(app)/movimientos/actions";
import { saveRecurring } from "@/app/(app)/movimientos/recurrentes/actions";
import { saveInvestment } from "@/app/(app)/inversiones/actions";
import { saveBudget } from "@/app/(app)/presupuesto/actions";
import { setAccountActive } from "@/app/(app)/cuentas/actions";
import { Persona } from "./app";
import { createTestDb, createUser, dbToday } from "./db";
import { cuadrar } from "./verificar";

describe("Formularios: errores humanos y protecciones", () => {
  let p: Persona;
  let otra: Persona;
  const id: Record<string, string> = {};

  before(async () => {
    const db = await createTestDb();
    const hoy = await dbToday(db);
    p = new Persona(db, await createUser(db, "ana@ejemplo.com"), hoy);
    otra = new Persona(db, await createUser(db, "intrusa@ejemplo.com"), hoy);
    id.caja = await p.crearCuenta("Caja", "cash", "1000");
    id.banco = await p.crearCuenta("Banco", "debit", "5000");
    id.tarjeta = await p.crearCuenta("Tarjeta", "credit", "200");
    id.comida = await p.crearCategoria("Comida", "expense");
    id.sueldo = await p.crearCategoria("Sueldo", "income");
    id.fondos = await p.crearCategoria("Fondos", "investment");
    id.otraCuenta = await otra.crearCuenta("Cuenta ajena", "cash", "50");
    id.otraCategoria = await otra.crearCategoria("Comida ajena", "expense");
  });

  // Después de cada caso, la base y el Libro deben seguir cuadrando.
  beforeEach(async () => {
    if (p) await cuadrar(p, "antes del caso");
  });

  async function nadaCambia(campos: Record<string, string>, motivo: string, accion = saveMovement) {
    const antes = await p.sql<{ n: number; s: number }>("select count(*)::int n, coalesce(sum(amount_cents),0)::bigint s from transactions");
    const r = await p.enviar(accion, { requestId: randomUUID(), ...campos });
    assert.ok(!r.ok && (r.error || r.fieldErrors), `${motivo}: debía rechazarse y respondió ${JSON.stringify(r)}`);
    const despues = await p.sql<{ n: number; s: number }>("select count(*)::int n, coalesce(sum(amount_cents),0)::bigint s from transactions");
    assert.deepEqual(despues, antes, `${motivo}: no debe crearse ni cambiarse ningún movimiento`);
    return r;
  }

  const gasto = (extra: Record<string, string>) => ({ type: "expense", amount: "10", categoryId: id.comida, accountId: id.caja, occurredOn: "2026-01-10", ...extra });

  it("acepta montos escritos de distintas formas y guarda el valor exacto en céntimos", async () => {
    for (const [texto, cents] of [
      ["1,500.50", 150050],
      ["1500.5", 150050],
      ["S/ 20", 2000],
      ["15,50", 1550],
      ["0.01", 1],
      ["9,999,999.99", 999999999],
    ] as const) {
      const mov = await p.registrar({ tipo: "expense", monto: texto, fecha: "2026-01-05", cuenta: id.banco, categoria: id.comida, descripcion: texto });
      const [row] = await p.sql<{ amount_cents: number }>("select amount_cents from transactions where id = $1", [mov]);
      assert.equal(row.amount_cents, cents, `"${texto}" debe guardarse como ${cents} céntimos`);
    }
  });

  it("rechaza montos inválidos sin tocar nada", async () => {
    for (const monto of ["", "abc", "0", "-5", "1.234", "12.345,00", "1,2,3"]) {
      await nadaCambia(gasto({ amount: monto }), `monto "${monto}"`);
    }
  });

  it("los céntimos no se pierden: 0.10 + 0.20 = 0.30 exactos", async () => {
    const antes = p.libro.saldo(id.caja);
    await p.registrar({ tipo: "expense", monto: "0.10", fecha: "2026-01-06", cuenta: id.caja, categoria: id.comida });
    await p.registrar({ tipo: "expense", monto: "0.20", fecha: "2026-01-06", cuenta: id.caja, categoria: id.comida });
    const [s] = await p.sql<{ balance_cents: number }>("select balance_cents from account_balances where account_id = $1", [id.caja]);
    assert.equal(s.balance_cents, antes - 30);
  });

  it("rechaza formas inválidas: sin categoría, transferencia a la misma cuenta o sin destino", async () => {
    await nadaCambia(gasto({ categoryId: "" }), "gasto sin categoría");
    await nadaCambia({ type: "transfer", amount: "10", accountId: id.caja, toAccountId: id.caja }, "transferencia a la misma cuenta");
    await nadaCambia({ type: "transfer", amount: "10", accountId: id.caja, toAccountId: "" }, "transferencia sin destino");
    await nadaCambia(gasto({ categoryId: id.sueldo }), "gasto con categoría de ingreso");
    await nadaCambia(gasto({ occurredOn: "2026-02-30" }), "fecha inexistente");
  });

  it("no se puede usar la cuenta o la categoría de otra persona", async () => {
    await nadaCambia(gasto({ accountId: id.otraCuenta }), "cuenta ajena");
    await nadaCambia(gasto({ categoryId: id.otraCategoria }), "categoría ajena");
    await nadaCambia({ type: "transfer", amount: "10", accountId: id.caja, toAccountId: id.otraCuenta }, "transferir a una cuenta ajena");
    const [{ balance_cents }] = await otra.sql<{ balance_cents: number }>("select balance_cents from account_balances");
    assert.equal(balance_cents, 5000, "el saldo de la otra persona sigue intacto");
  });

  it("doble clic: el mismo envío dos veces crea un solo movimiento", async () => {
    const requestId = randomUUID();
    const datos = { tipo: "expense" as const, monto: "33.30", fecha: "2026-01-07", cuenta: id.caja, categoria: id.comida, requestId };
    await p.registrar(datos);
    await p.registrar(datos);
    const rows = await p.sql("select id from transactions where request_id = $1", [requestId]);
    assert.equal(rows.length, 1);
  });

  it("sin cuenta usa la de defecto y sin fecha usa hoy", async () => {
    const mov = await p.registrar({ tipo: "expense", monto: "5", categoria: id.comida });
    const [row] = await p.sql<{ account_id: string; occurred_on: string }>("select account_id, occurred_on from transactions where id = $1", [mov]);
    assert.equal(row.account_id, id.caja, "la primera cuenta creada es la de defecto");
    assert.equal(row.occurred_on, p.libro.hoy);
  });

  it("editar y borrar mueven el saldo exactamente lo que deben", async () => {
    const mov = await p.registrar({ tipo: "expense", monto: "100", fecha: "2026-01-08", cuenta: id.banco, categoria: id.comida });
    await p.editar(mov, { monto: "250.75" });
    await cuadrar(p, "después de editar");
    await p.editar(mov, { fecha: "2025-12-31" }); // cambiarlo de mes
    await cuadrar(p, "después de cambiar de mes");
    await p.borrar(mov);
    await cuadrar(p, "después de borrar");
  });

  it("categoría deshabilitada: no acepta nuevos gastos, pero el historial se conserva y se puede corregir", async () => {
    const cat = await p.crearCategoria("Ropa", "expense");
    const viejo = await p.registrar({ tipo: "expense", monto: "80", fecha: "2026-01-09", cuenta: id.banco, categoria: cat });
    await p.activarCategoria(cat, false);
    await nadaCambia(gasto({ categoryId: cat }), "gasto en categoría deshabilitada");
    await p.editar(viejo, { monto: "85" }); // corregir uno viejo sí se puede
    const [{ total }] = await p.sql<{ total: number }>("select sum(amount_cents)::bigint total from categorized_movements where category_id = $1", [cat]);
    assert.equal(Number(total), 8500, "el gasto viejo sigue contando en los reportes");
  });

  it("cuenta deshabilitada: no acepta movimientos nuevos; la de defecto no se puede deshabilitar", async () => {
    const cuenta = await p.crearCuenta("Vieja", "debit", "0");
    await p.activarCuenta(cuenta, false);
    await nadaCambia(gasto({ accountId: cuenta }), "gasto en cuenta deshabilitada");
    const r = await p.enviar(setAccountActive, { id: id.caja, active: "false" });
    assert.ok(!r.ok, "la cuenta por defecto no se deshabilita");
  });

  it("tarjeta de crédito: la deuda inicial se guarda en negativo y pagarla es una transferencia", async () => {
    assert.equal(p.libro.cuentas.get(id.tarjeta)!.inicial, -20000);
    const [m0] = await p.sql<{ expense_cents: number | null }>("select coalesce(sum(expense_cents),0)::bigint expense_cents from monthly_summary");
    await p.registrar({ tipo: "transfer", monto: "200", fecha: "2026-01-10", cuenta: id.banco, hacia: id.tarjeta, descripcion: "Pago tarjeta" });
    const [m1] = await p.sql<{ expense_cents: number | null }>("select coalesce(sum(expense_cents),0)::bigint expense_cents from monthly_summary");
    assert.equal(Number(m1.expense_cents), Number(m0.expense_cents), "pagar la tarjeta no suma gasto");
    const [t] = await p.sql<{ balance_cents: number }>("select balance_cents from account_balances where account_id = $1", [id.tarjeta]);
    assert.equal(t.balance_cents, 0);
  });

  it("inversiones: valorizar o abrir una posición no mueve dinero; aportar y rescatar sí", async () => {
    const totalAntes = (await p.sql<{ s: number }>("select sum(balance_cents)::bigint s from account_balances"))[0].s;
    const inv = await p.invertir({ operacion: "opening", monto: "3000", capitalInicial: "2500", categoria: id.fondos, nombre: "Fondo antiguo", fecha: "2026-01-02" });
    await p.invertir({ operacion: "valuation", monto: "3100", inversion: inv, fecha: "2026-01-20" });
    assert.equal((await p.sql<{ s: number }>("select sum(balance_cents)::bigint s from account_balances"))[0].s, totalAntes, "abrir/valorizar no toca cuentas");
    await p.invertir({ operacion: "invest", monto: "400", inversion: inv, categoria: id.fondos, cuenta: id.banco, fecha: "2026-01-21" });
    await p.invertir({ operacion: "divest", monto: "150", inversion: inv, cuenta: id.banco, fecha: "2026-01-22" });
    await cuadrar(p, "después de invertir");
    const r = await p.enviar(saveInvestment, {
      operation: "divest", requestId: randomUUID(), investmentId: inv, categoryId: "", accountId: id.banco, entryId: "",
      name: "", platform: "", description: "", date: "2026-01-23", amount: "0", initialCapital: "",
    });
    assert.ok(!r.ok, "un rescate de 0 se rechaza");
  });

  it("presupuesto: no deja repartir más del 100 % ni presupuestar ingresos", async () => {
    const pct = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => ["pct_" + k, v]));
    assert.ok(!(await p.enviar(saveBudget, { month: "2026-01", total: "1000", ...pct({ [id.comida]: "70", [id.fondos]: "40" }) })).ok, "más de 100 %");
    assert.ok(!(await p.enviar(saveBudget, { month: "2026-01", total: "1000", ...pct({ [id.sueldo]: "10" }) })).ok, "categoría de ingreso");
    assert.ok(!(await p.enviar(saveBudget, { month: "2026-01", total: "0", ...pct({ [id.comida]: "10" }) })).ok, "total cero");
    const planes = await p.sql("select * from budget_plans");
    assert.equal(planes.length, 0, "ningún intento inválido dejó un presupuesto a medias");
  });

  it("recurrentes: rechaza fechas al revés y transferencias a la misma cuenta", async () => {
    const base = { id: "", type: "expense", amount: "10", description: "X", categoryId: id.comida, accountId: id.caja, toAccountId: "", frequency: "monthly", start: "2026-01-10", end: "" };
    assert.ok(!(await p.enviar(saveRecurring, { ...base, end: "2026-01-01" })).ok, "fin antes del inicio");
    assert.ok(!(await p.enviar(saveRecurring, { ...base, type: "transfer", categoryId: "", toAccountId: id.caja })).ok, "misma cuenta");
    assert.ok(!(await p.enviar(saveRecurring, { ...base, amount: "-3" })).ok, "monto negativo");
    assert.equal((await p.sql("select * from recurring_rules")).length, 0);
  });
});
