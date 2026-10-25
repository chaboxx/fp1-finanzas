// Scripts para marcar como dólares cuentas que ya se usaban para dólares cuando la
// app era solo en soles: no cambian ningún monto, se niegan si mezclarían monedas
// y no tocan a otras personas.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { before, describe, it } from "node:test";
import { Persona } from "./app";
import { createTestDb, createUser, dbToday } from "./db";
import { cuadrar } from "./verificar";

const leer = (f: string) => readFileSync(join(import.meta.dirname, "..", "..", "scripts", f), "utf8");
// Llena los datos de ejemplo del script como lo haría la persona.
const conDatos = (sql: string, correo: string, cuentas: string[]) =>
  sql
    .replace("'tu-correo@ejemplo.com'", `'${correo}'`)
    .replace("array['Nombre de tu cuenta en dólares']", `array[${cuentas.map((c) => `'${c}'`).join(", ")}]`);
const VISTA_PREVIA = leer("cuentas-a-dolares-1-vista-previa.sql");
const CONVERTIR = leer("cuentas-a-dolares-2-convertir.sql");

describe("Cuentas existentes a dólares", () => {
  let ana: Persona;
  let beto: Persona;
  const id: Record<string, string> = {};

  before(async () => {
    const db = await createTestDb();
    const hoy = await dbToday(db);
    ana = new Persona(db, await createUser(db, "ana@ejemplo.com"), hoy);
    beto = new Persona(db, await createUser(db, "beto@ejemplo.com"), hoy);
    id.bcp = await ana.crearCuenta("BCP", "debit", "1000");
    // Cuenta que Ana usaba para dólares, con los montos escritos en dólares.
    id.dolares = await ana.crearCuenta("Interbank Dólares", "savings", "300");
    id.sueldo = await ana.crearCategoria("Sueldo", "income");
    id.comida = await ana.crearCategoria("Comida", "expense");
    id.etf = await ana.crearCategoria("ETF", "investment");
    await ana.registrar({ tipo: "income", monto: "2000", fecha: "2025-07-01", cuenta: id.bcp, categoria: id.sueldo });
    await ana.registrar({ tipo: "expense", monto: "40", fecha: "2025-07-03", cuenta: id.dolares, categoria: id.comida });
    id.inversion = await ana.invertir({ operacion: "invest", monto: "100", categoria: id.etf, nombre: "ETF", cuenta: id.dolares, fecha: "2025-07-05" });
    id.cruce = await ana.registrar({ tipo: "transfer", monto: "50", fecha: "2025-07-06", cuenta: id.bcp, hacia: id.dolares });
    // Beto tiene una cuenta con el mismo nombre: no debe tocarse.
    id.betoDolares = await beto.crearCuenta("Interbank Dólares", "savings", "10");
  });

  const vistaPrevia = async () =>
    (await ana.db.query<{ tipo: string; nombre: string; estado: string; detalle: string }>(
      conDatos(VISTA_PREVIA, "ana@ejemplo.com", ["Interbank Dólares"]),
    )).rows;
  const monedas = async () =>
    Object.fromEntries(
      (await ana.db.query<{ id: string; currency: string }>("select id, currency from public.accounts union all select id, currency from public.investments")).rows.map(
        (r) => [r.id, r.currency],
      ),
    );

  it("con una transferencia desde soles, la vista previa lo explica y la conversión no cambia nada", async () => {
    const filas = await vistaPrevia();
    const cuenta = filas.find((f) => f.tipo === "cuenta")!;
    assert.equal(cuenta.estado, "NO SE PUEDE");
    assert.match(cuenta.detalle, /1 transferencias con cuentas en soles/);
    assert.equal(filas.find((f) => f.tipo === "inversión")!.estado, "OK");

    const antes = await monedas();
    await assert.rejects(ana.db.exec(conDatos(CONVERTIR, "ana@ejemplo.com", ["Interbank Dólares"])), /No se cambió nada/);
    assert.deepEqual(await monedas(), antes);
  });

  it("un nombre que no existe se avisa en la vista previa y la conversión se niega", async () => {
    const filas = (
      await ana.db.query<{ estado: string; detalle: string }>(conDatos(VISTA_PREVIA, "ana@ejemplo.com", ["No existe"]))
    ).rows;
    assert.deepEqual(filas, [{ tipo: "cuenta", nombre: "No existe", moneda_actual: null, movimientos: null, estado: "NO SE PUEDE", detalle: "No existe una cuenta con ese nombre para ese correo" }]);
    await assert.rejects(ana.db.exec(conDatos(CONVERTIR, "ana@ejemplo.com", ["No existe"])), /Alguna cuenta no existe/);
  });

  it("sin conflictos, marca la cuenta y su inversión como dólares sin cambiar ningún monto", async () => {
    await ana.borrar(id.cruce);
    assert.ok((await vistaPrevia()).every((f) => f.estado === "OK"));
    const saldos = async () => (await ana.sql("select account_id, balance_cents from account_balances order by account_id"));
    const antes = await saldos();
    const montos = await ana.sql("select id, amount_cents from transactions order by id");

    await ana.db.exec(conDatos(CONVERTIR, "ana@ejemplo.com", ["Interbank Dólares"]));

    const despues = await monedas();
    assert.equal(despues[id.dolares], "USD");
    assert.equal(despues[id.inversion], "USD");
    assert.equal(despues[id.bcp], "PEN");
    assert.equal(despues[id.betoDolares], "PEN", "la cuenta de otra persona con el mismo nombre no cambia");
    assert.deepEqual(await saldos(), antes, "los saldos no cambian");
    assert.deepEqual(await ana.sql("select id, amount_cents from transactions order by id"), montos, "los montos no cambian");

    // Los dólares salen del resumen en soles y aparecen en el de dólares.
    const meses = await ana.sql<{ currency: string; expense_cents: number | null; invested_cents: number | null }>(
      "select currency, expense_cents, invested_cents from monthly_summary where month = '2025-07-01' order by currency",
    );
    assert.deepEqual(meses.map((m) => [m.currency, m.expense_cents, m.invested_cents]), [
      ["PEN", null, null],
      ["USD", 4000, 10000],
    ]);

    // La protección vuelve a estar activa.
    await assert.rejects(
      ana.sql("update accounts set currency = 'PEN' where id = $1", [id.dolares]),
      /moneda de una cuenta/,
    );

    ana.libro.cuentas.get(id.dolares)!.moneda = "USD";
    await cuadrar(ana, "después de convertir");
    await cuadrar(beto, "otra persona");
  });
});
