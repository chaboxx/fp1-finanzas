// Invariantes contables: lo que SIEMPRE debe cumplirse, sin importar qué hizo el usuario.
// Cada una compara la base (y las funciones de la app) contra el Libro independiente.
import assert from "node:assert/strict";
import { byCategory, summarize } from "@/lib/dashboard";
import { getReportRows } from "@/lib/finance-data";
import type { Persona } from "./app";
import { createFakeClient } from "./fake-supabase";

const fmt = (c: number) => (c / 100).toFixed(2);

export async function cuadrar(p: Persona, etiqueta: string) {
  const { libro } = p;
  const msg = (que: string) => `[${etiqueta}] ${que}`;

  // 1. Saldo de cada cuenta = saldo inicial + efectos de sus movimientos ejecutados.
  const saldos = await p.sql<{ account_id: string; balance_cents: number }>("select account_id, balance_cents from account_balances");
  assert.equal(saldos.length, libro.cuentas.size, msg("cantidad de cuentas"));
  for (const s of saldos) {
    assert.equal(s.balance_cents, libro.saldo(s.account_id), msg(`saldo de la cuenta ${s.account_id}`));
  }

  // 2. Conservación del dinero, calculada de dos formas independientes.
  const total = saldos.reduce((a, s) => a + s.balance_cents, 0);
  const inicial = [...libro.cuentas.values()].reduce((a, c) => a + c.inicial, 0);
  const t = libro.totales("0000-01-01", libro.hoy);
  assert.equal(total, inicial + t.income + t.divest - t.expense - t.invest, msg(`conservación: total ${fmt(total)}`));
  const [crudo] = await p.sql<{ total: number }>(`
    select (select coalesce(sum(initial_balance_cents), 0) from accounts)
         + coalesce(sum(case when type in ('income','divest') then amount_cents
                             when type in ('expense','invest') then -amount_cents else 0 end), 0) as total
    from transactions where occurred_on <= (now() at time zone 'America/Lima')::date`);
  assert.equal(Number(crudo.total), total, msg("la vista de saldos coincide con un recálculo directo desde los movimientos"));

  // 3. Mismos movimientos: cantidad y suma por tipo.
  const porTipo = await p.sql<{ type: string; n: number; cents: number }>(
    "select type::text, count(*)::int n, sum(amount_cents)::bigint cents from transactions group by type",
  );
  const esperado = new Map<string, { n: number; cents: number }>();
  for (const m of libro.movimientos.values()) {
    const e = esperado.get(m.type) ?? { n: 0, cents: 0 };
    esperado.set(m.type, { n: e.n + 1, cents: e.cents + m.cents });
  }
  assert.deepEqual(
    Object.fromEntries(porTipo.map((r) => [r.type, { n: r.n, cents: Number(r.cents) }])),
    Object.fromEntries(esperado),
    msg("movimientos por tipo"),
  );

  // 4. Resumen mensual (vista que usan Métricas y el historial).
  const meses = await p.sql<{ month: string; income_cents: number | null; expense_cents: number | null; invested_cents: number | null; divested_cents: number | null }>(
    "select * from monthly_summary order by month",
  );
  for (const m of meses) {
    const desde = m.month;
    const hasta = new Date(Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7), 0)).toISOString().slice(0, 10);
    const e = libro.totales(desde, hasta < libro.hoy ? hasta : libro.hoy);
    assert.deepEqual(
      [m.income_cents ?? 0, m.expense_cents ?? 0, m.invested_cents ?? 0, m.divested_cents ?? 0],
      [e.income, e.expense, e.invest, e.divest],
      msg(`resumen de ${desde.slice(0, 7)}`),
    );
  }

  // 5. Lo que lee la pantalla Resumen (consultas paginadas de la app + summarize/byCategory).
  const rows = await getReportRows(createFakeClient(p.db, p.user.id) as never, "2000-01-01", "2100-01-01");
  const s = summarize(rows);
  const todo = libro.totales("0000-01-01", "9999-12-31");
  assert.deepEqual([s.income, s.expense, s.invested, s.divested], [todo.income, todo.expense, todo.invest, todo.divest], msg("reporte de la app"));
  const egresos = libro.egresosPorCategoria("0000-01-01", "9999-12-31");
  for (const c of byCategory(rows)) {
    assert.equal(c.cents, egresos.get(c.id) ?? 0, msg(`egresos de la categoría ${c.name}`));
  }
}
