// La auditoría (scripts/auditoria.sql) y las verificaciones deben DETECTAR errores.
// Aquí se sabotea la base a propósito: si un sabotaje pasa inadvertido, la red de
// seguridad no sirve y este test falla.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { Persona } from "./app";
import { createTestDb, createUser, dbToday } from "./db";
import { cuadrar } from "./verificar";

const AUDITORIA = readFileSync(join(import.meta.dirname, "..", "..", "scripts", "auditoria.sql"), "utf8");

async function escenario() {
  const db = await createTestDb();
  const p = new Persona(db, await createUser(db, "ana@ejemplo.com"), await dbToday(db));
  const banco = await p.crearCuenta("Banco", "debit", "1000");
  const ahorro = await p.crearCuenta("Ahorro", "savings", "0");
  const comida = await p.crearCategoria("Comida", "expense");
  const sueldo = await p.crearCategoria("Sueldo", "income");
  const fondos = await p.crearCategoria("Fondos", "investment");
  await p.registrar({ tipo: "income", monto: "3000", fecha: "2025-05-01", cuenta: banco, categoria: sueldo });
  await p.registrar({ tipo: "expense", monto: "120.40", fecha: "2025-05-03", cuenta: banco, categoria: comida });
  await p.registrar({ tipo: "transfer", monto: "500", fecha: "2025-05-04", cuenta: banco, hacia: ahorro });
  await p.invertir({ operacion: "invest", monto: "200", categoria: fondos, nombre: "Fondo", cuenta: banco, fecha: "2025-05-05" });
  await p.presupuestar("2025-05", "2000", { [comida]: "40", [fondos]: "30" });
  const regla = await p.crearRecurrente({ tipo: "expense", monto: "50", descripcion: "Plan celular", frecuencia: "monthly", inicio: "2025-01-10", fin: "2025-04-30", categoria: comida, cuenta: banco });
  await p.procesarRecurrentes();
  return { db, p, banco, ahorro, comida, sueldo, regla };
}

async function auditar(e: Awaited<ReturnType<typeof escenario>>) {
  const res = await e.db.query<{ comprobacion: string; estado: string; detalle: string }>(AUDITORIA);
  return res.rows;
}

describe("Auditoría contable y detección de sabotajes", () => {
  let e: Awaited<ReturnType<typeof escenario>>;
  beforeEach(async () => {
    e = await escenario();
  });

  it("con datos sanos, todas las comprobaciones dan OK", async () => {
    await cuadrar(e.p, "escenario sano");
    const filas = await auditar(e);
    const malas = filas.filter((f) => f.estado === "REVISAR");
    assert.deepEqual(malas, [], "no debería haber nada que revisar");
    assert.ok(filas.length >= 12);
  });

  it("detecta una vista de saldos que se olvida de las transferencias entrantes", async () => {
    await e.db.exec(`
      create or replace view public.account_balances with (security_invoker = true) as
      select a.id as account_id, a.user_id, a.name, a.type, a.is_active,
        a.initial_balance_cents + coalesce(sum(case when t.type in ('income','divest') then t.amount_cents else -t.amount_cents end), 0) as balance_cents,
        a.currency
      from public.accounts a left join public.transactions t on t.account_id = a.id
      group by a.id;`);
    await assert.rejects(cuadrar(e.p, "saldos saboteados"), /saldo de la cuenta|conservación/);
    const filas = await auditar(e);
    assert.equal(filas.find((f) => f.comprobacion.startsWith("Saldo de cada cuenta"))!.estado, "REVISAR");
  });

  it("detecta un resumen mensual que cuenta las transferencias como gasto", async () => {
    await e.db.exec(`
      create or replace view public.monthly_summary with (security_invoker = true) as
      select t.user_id, date_trunc('month', t.occurred_on)::date as month,
        sum(t.amount_cents) filter (where t.type = 'income') as income_cents,
        sum(t.amount_cents) filter (where t.type in ('expense','transfer')) as expense_cents,
        sum(t.amount_cents) filter (where t.type = 'invest') as invested_cents,
        sum(t.amount_cents) filter (where t.type = 'divest') as divested_cents,
        a.currency
      from public.transactions t join public.accounts a on a.id = t.account_id group by 1, 2, a.currency;`);
    await assert.rejects(cuadrar(e.p, "resumen saboteado"), /resumen de/);
    assert.equal((await auditar(e)).find((f) => f.comprobacion.startsWith("Resumen mensual"))!.estado, "REVISAR");
  });

  it("detecta un recurrente duplicado y un gasto con categoría de ingreso", async () => {
    await e.db.exec(`
      set session_replication_role = replica; -- apaga triggers y FKs para simular datos corruptos
      drop index public.transactions_recurring_once_uniq;
      insert into public.transactions (user_id, type, amount_cents, occurred_on, account_id, category_id, recurring_rule_id)
        select user_id, type, amount_cents, occurred_on, account_id, category_id, recurring_rule_id
        from public.transactions where recurring_rule_id is not null limit 1;
      update public.transactions set category_id = '${e.sueldo}' where type = 'expense' and recurring_rule_id is null;
      set session_replication_role = origin;`);
    const filas = await auditar(e);
    assert.equal(filas.find((f) => f.comprobacion.startsWith("Recurrentes sin duplicados"))!.estado, "REVISAR");
    assert.equal(filas.find((f) => f.comprobacion.startsWith("Gastos con categoría"))!.estado, "REVISAR");
    await assert.rejects(cuadrar(e.p, "datos corruptos"));
  });

  it("detecta un presupuesto repartido a más del 100 %", async () => {
    await e.db.exec(`
      set session_replication_role = replica;
      update public.budget_allocations set percentage_bps = 9000;
      set session_replication_role = origin;`);
    assert.equal((await auditar(e)).find((f) => f.comprobacion.startsWith("Presupuestos repartidos"))!.estado, "REVISAR");
  });

  it("detecta dinero que cruza de soles a dólares por fuera de la app", async () => {
    // Pasar a dólares una cuenta con movimientos (saltándose el trigger) deja una
    // transferencia entre monedas y un recurrente en dólares.
    await e.db.exec(`
      set session_replication_role = replica;
      update public.accounts set currency = 'USD' where id = '${e.ahorro}';
      update public.recurring_rules set account_id = '${e.ahorro}' where id = '${e.regla}';
      set session_replication_role = origin;`);
    const filas = await auditar(e);
    assert.equal(filas.find((f) => f.comprobacion.startsWith("Transferencias, aportes y rescates"))!.estado, "REVISAR");
    assert.equal(filas.find((f) => f.comprobacion.startsWith("Recurrentes solo en cuentas en soles"))!.estado, "REVISAR");
    await assert.rejects(cuadrar(e.p, "monedas mezcladas"), /mezcla monedas|conservación/);
  });

  it("detecta un movimiento borrado o cambiado por fuera de la app", async () => {
    await e.db.exec(`delete from public.transactions where type = 'income'`);
    await assert.rejects(cuadrar(e.p, "movimiento borrado por fuera"), /saldo|conservación|movimientos por tipo/);
  });
});
