// Prueba el esquema en un Postgres en memoria (PGlite), simulando lo mínimo de
// Supabase (auth.users, auth.uid(), rol authenticated). Uso: npm run test:db
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(import.meta.dirname, "..", "migrations");
const db = new PGlite();

// --- Stub mínimo de lo que Supabase provee ---
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role authenticated nologin;
  create role anon nologin;
  grant usage on schema auth to authenticated;
`);

for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
}
await db.exec(`
  grant usage on schema public to authenticated;
  grant all on all tables in schema public to authenticated;
  grant execute on all functions in schema public to authenticated;
`);
console.log("OK migraciones aplicadas");

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
await db.exec(`insert into auth.users (id, email) values ('${A}','a@x.com'), ('${B}','b@x.com');`);

let failures = 0;
async function as(user, sql) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user}', false); set role authenticated;`);
  const res = await db.exec(sql);
  return res[res.length - 1];
}
async function expectOk(name, user, sql) {
  try { const r = await as(user, sql); console.log("PASS", name); return r; }
  catch (e) { failures++; console.log("FAIL", name, "->", e.message); }
}
async function expectError(name, user, sql, match) {
  try { await as(user, sql); failures++; console.log("FAIL (no error)", name); }
  catch (e) {
    if (match && !e.message.includes(match)) { failures++; console.log("FAIL (otro error)", name, "->", e.message); }
    else console.log("PASS", name, "->", e.message);
  }
}

// Perfil creado por trigger
const prof = await expectOk("perfil auto-creado", A, `select * from profiles`);
console.log("   perfiles visibles para A:", prof.rows.length, prof.rows[0]?.timezone, prof.rows[0]?.currency);

// Setup de A
await expectError("gasto sin cuenta ni cuenta por defecto", A, `
  insert into transactions (type, amount_cents, category_id, description) values ('expense', 1500, 'cccccccc-0000-0000-0000-000000000001', 'Almuerzo')`, "cuenta por defecto");
await expectOk("crear cuentas", A, `
  insert into accounts (id, name, type, initial_balance_cents) values
   ('aaaaaaaa-0000-0000-0000-000000000001','Efectivo','cash', 10000),
   ('aaaaaaaa-0000-0000-0000-000000000002','BCP Débito','debit', 500000),
   ('aaaaaaaa-0000-0000-0000-000000000003','Visa','credit', 0)`);
const firstDefault = await as(A, `select default_account_id from profiles`);
console.log(firstDefault.rows[0].default_account_id === "aaaaaaaa-0000-0000-0000-000000000001"
  ? "PASS la primera cuenta pasa a ser la cuenta por defecto"
  : (failures++, "FAIL cuenta por defecto inicial: " + firstDefault.rows[0].default_account_id));
await expectOk("crear categorías", A, `
  insert into categories (id, name, kind) values
   ('cccccccc-0000-0000-0000-000000000001','Comida','expense'),
   ('cccccccc-0000-0000-0000-000000000002','Sueldo','income'),
   ('cccccccc-0000-0000-0000-000000000003','Fondos mutuos','investment'),
   ('cccccccc-0000-0000-0000-000000000004','Ocio','expense')`);
await expectError("nombre de categoría duplicado (sin importar mayúsculas)", A,
  `insert into categories (name, kind) values ('comida','expense')`, "duplicate");
await expectOk("configurar cuenta por defecto", A,
  `update profiles set default_account_id = 'aaaaaaaa-0000-0000-0000-000000000002'`);
await expectError("deshabilitar la cuenta por defecto", A,
  `update accounts set is_active = false where id = 'aaaaaaaa-0000-0000-0000-000000000002'`, "cuenta por defecto");
await expectOk("deshabilitar otra cuenta", A,
  `update accounts set is_active = false where id = 'aaaaaaaa-0000-0000-0000-000000000001'`);
await expectError("elegir una cuenta deshabilitada como defecto", A,
  `update profiles set default_account_id = 'aaaaaaaa-0000-0000-0000-000000000001'`, "debe estar activa");
await expectOk("reactivar cuenta", A,
  `update accounts set is_active = true where id = 'aaaaaaaa-0000-0000-0000-000000000001'`);

await expectOk("gasto sin cuenta ni fecha => cuenta por defecto + hoy", A, `
  insert into transactions (type, amount_cents, category_id, description)
  values ('expense', 1500, 'cccccccc-0000-0000-0000-000000000001', 'Almuerzo')`);
const t1 = await as(A, `select account_id, occurred_on, user_id from transactions`);
console.log("   ", t1.rows[0]);

await expectOk("ingreso", A, `
  insert into transactions (type, amount_cents, category_id, description, account_id)
  values ('income', 800000, 'cccccccc-0000-0000-0000-000000000002', 'Sueldo', 'aaaaaaaa-0000-0000-0000-000000000002')`);
await expectOk("gasto con tarjeta de crédito", A, `
  insert into transactions (type, amount_cents, category_id, description, account_id)
  values ('expense', 20000, 'cccccccc-0000-0000-0000-000000000004', 'Cine', 'aaaaaaaa-0000-0000-0000-000000000003')`);
await expectOk("pagar tarjeta = transferencia", A, `
  insert into transactions (type, amount_cents, account_id, to_account_id, description)
  values ('transfer', 20000, 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003', 'Pago Visa')`);
await expectError("transferencia con categoría", A, `
  insert into transactions (type, amount_cents, account_id, to_account_id, category_id)
  values ('transfer', 100, 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000001')`, "check constraint");
await expectError("transferencia a la misma cuenta", A, `
  insert into transactions (type, amount_cents, account_id, to_account_id)
  values ('transfer', 100, 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002')`, "check constraint");
await expectError("gasto con categoría de ingreso", A, `
  insert into transactions (type, amount_cents, category_id) values ('expense', 100, 'cccccccc-0000-0000-0000-000000000002')`, "tipo expense");
await expectError("monto negativo", A, `
  insert into transactions (type, amount_cents, category_id) values ('expense', -5, 'cccccccc-0000-0000-0000-000000000001')`, "check constraint");

// Inversiones
await expectError("inversión con categoría de gasto", A, `
  insert into investments (name, category_id) values ('X', 'cccccccc-0000-0000-0000-000000000001')`, "tipo investment");
await expectOk("crear inversión + aporte", A, `
  insert into investments (id, name, category_id, platform) values ('dddddddd-0000-0000-0000-000000000001','Fondo BCP','cccccccc-0000-0000-0000-000000000003','BCP');
  insert into transactions (type, amount_cents, investment_id, description) values ('invest', 100000, 'dddddddd-0000-0000-0000-000000000001', 'Aporte fondo');
  insert into investment_valuations (investment_id, value_cents) values ('dddddddd-0000-0000-0000-000000000001', 102500)`);

// Saldos
const bal = await as(A, `select name, balance_cents from account_balances order by name`);
console.log("   saldos:", bal.rows.map(r => `${r.name}=${r.balance_cents}`).join(", "));
const expected = { "BCP Débito": 500000 - 1500 + 800000 - 20000 - 100000, "Efectivo": 10000, "Visa": -20000 + 20000 };
for (const r of bal.rows) {
  if (Number(r.balance_cents) !== expected[r.name]) { failures++; console.log("FAIL saldo", r.name, r.balance_cents, "esperado", expected[r.name]); }
}
console.log("PASS saldos calculados (si no hay FAIL arriba)");

// Resumen mensual y presupuesto
const ms = await as(A, `select income_cents, expense_cents, invested_cents from monthly_summary`);
console.log("   resumen mensual:", ms.rows[0]);
await expectOk("presupuestos (gasto e inversión)", A, `
  insert into budgets (category_id, month, amount_cents) values
   ('cccccccc-0000-0000-0000-000000000001', date_trunc('month', user_today())::date, 50000),
   ('cccccccc-0000-0000-0000-000000000003', date_trunc('month', user_today())::date, 200000)`);
await expectError("presupuesto en categoría de ingreso", A, `
  insert into budgets (category_id, month, amount_cents) values ('cccccccc-0000-0000-0000-000000000002', date_trunc('month', user_today())::date, 100)`, "tipo expense o investment");
await expectError("presupuesto con mes que no es día 1", A, `
  insert into budgets (category_id, month, amount_cents) values ('cccccccc-0000-0000-0000-000000000004', '2026-10-15', 100)`, "check constraint");
const bp = await as(A, `select category_name, budget_cents, spent_cents, used_pct from budget_progress order by category_name`);
console.log("   avance presupuesto:", bp.rows);

// Deshabilitar categoría: historial se mantiene, no acepta nuevos
await expectOk("deshabilitar categoría", A, `update categories set is_active = false where id = 'cccccccc-0000-0000-0000-000000000004'`);
await expectError("gasto nuevo en categoría deshabilitada", A, `
  insert into transactions (type, amount_cents, category_id) values ('expense', 100, 'cccccccc-0000-0000-0000-000000000004')`, "deshabilitada");
await expectOk("editar monto de gasto viejo en categoría deshabilitada", A, `
  update transactions set amount_cents = 21000 where description = 'Cine'`);
const hist = await as(A, `select category_name, category_is_active, amount_cents from categorized_movements where category_name = 'Ocio'`);
console.log("   historial categoría deshabilitada:", hist.rows);
const del = await as(A, `delete from categories where id = 'cccccccc-0000-0000-0000-000000000004' returning id`);
console.log(del.rows.length === 0 ? "PASS borrar categoría no tiene efecto (RLS)" : (failures++, "FAIL se borró una categoría"));

// Metas
await expectOk("meta de ahorro + aportes", A, `
  insert into savings_goals (id, name, target_cents, target_date) values ('eeeeeeee-0000-0000-0000-000000000001','Viaje', 2000000, '2026-12-31');
  insert into goal_contributions (goal_id, amount_cents) values ('eeeeeeee-0000-0000-0000-000000000001', 500000), ('eeeeeeee-0000-0000-0000-000000000001', 300000)`);
const gp = await as(A, `select name, saved_cents, progress_pct from goal_progress`);
console.log("   meta:", gp.rows[0]);

// Recurrentes: idempotencia
await expectOk("regla recurrente + generación", A, `
  insert into recurring_rules (id, type, amount_cents, description, category_id, start_on, next_run_on)
  values ('ffffffff-0000-0000-0000-000000000001', 'income', 800000, 'Sueldo', 'cccccccc-0000-0000-0000-000000000002', '2026-10-30', '2026-10-30');
  insert into transactions (type, amount_cents, category_id, description, recurring_rule_id, occurred_on)
  values ('income', 800000, 'cccccccc-0000-0000-0000-000000000002', 'Sueldo', 'ffffffff-0000-0000-0000-000000000001', '2026-10-30')`);
await expectError("regla recurrente no se duplica en la misma fecha", A, `
  insert into transactions (type, amount_cents, category_id, description, recurring_rule_id, occurred_on)
  values ('income', 800000, 'cccccccc-0000-0000-0000-000000000002', 'Sueldo', 'ffffffff-0000-0000-0000-000000000001', '2026-10-30')`, "duplicate");

// Autocompletado
await expectOk("más movimientos para autocompletar", A, `
  insert into transactions (type, amount_cents, category_id, description, occurred_on) values
   ('expense', 1800, 'cccccccc-0000-0000-0000-000000000001', 'Almuerzo', '2026-10-01'),
   ('expense', 4500, 'cccccccc-0000-0000-0000-000000000001', 'Almuerzo menú', '2026-10-02')`);
const sug = await as(A, `select description, amount_cents, uses from suggest_descriptions('alm')`);
console.log("   sugerencias 'alm':", sug.rows);

// Aislamiento entre usuarios
const seenByB = await as(B, `select (select count(*) from transactions) t, (select count(*) from accounts) a, (select count(*) from categories) c, (select count(*) from account_balances) ab`);
const s = seenByB.rows[0];
console.log(Number(s.t) + Number(s.a) + Number(s.c) + Number(s.ab) === 0 ? "PASS B no ve nada de A" : (failures++, "FAIL B ve datos de A: " + JSON.stringify(s)));
await expectOk("B crea su cuenta y categoría", B, `
  insert into accounts (id, name, type) values ('bbbbbbbb-0000-0000-0000-000000000001','Efectivo','cash');
  insert into categories (name, kind) values ('Comida','expense')`);
await expectError("B usa la categoría de A", B, `
  insert into transactions (type, amount_cents, category_id, account_id) values ('expense', 100, 'cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001')`);
await expectError("B usa la cuenta de A", B, `
  insert into transactions (type, amount_cents, account_id, to_account_id) values ('transfer', 100, 'bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002')`);
await expectError("B se inserta como A", B, `
  insert into accounts (user_id, name, type) values ('${A}', 'Hack', 'cash')`, "row-level security");
await expectError("B pone cuenta de A como su default", B, `
  update profiles set default_account_id = 'aaaaaaaa-0000-0000-0000-000000000002'`);

console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLAS`);
process.exit(failures ? 1 : 0);
