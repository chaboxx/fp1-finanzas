// Invariantes contables: lo que SIEMPRE debe cumplirse, sin importar qué hizo el usuario.
// Cada una compara la base (y las funciones de la app) contra el Libro independiente.
import assert from "node:assert/strict";
import { byCategory, summarize } from "@/lib/dashboard";
import { getReportRows } from "@/lib/finance-data";
import type { Persona } from "./app";
import { createFakeClient } from "./fake-supabase";
import { CURRENCIES } from "@/lib/money";

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

  // 2. Conservación del dinero POR MONEDA (soles y dólares nunca se mezclan), de dos
  //    formas independientes. Las transferencias se anulan porque son de la misma moneda.
  for (const moneda of CURRENCIES) {
    const cuentas = [...libro.cuentas].filter(([, c]) => c.moneda === moneda);
    const total = saldos
      .filter((s) => libro.cuentas.get(s.account_id)!.moneda === moneda)
      .reduce((a, s) => a + s.balance_cents, 0);
    const inicial = cuentas.reduce((a, [, c]) => a + c.inicial, 0);
    const t = libro.totales("0000-01-01", libro.hoy, moneda);
    assert.equal(total, inicial + t.income + t.divest - t.expense - t.invest, msg(`conservación en ${moneda}: total ${fmt(total)}`));
    const [crudo] = await p.sql<{ total: number }>(
      `
      select (select coalesce(sum(initial_balance_cents), 0) from accounts where currency = $1)
           + coalesce(sum(case when t.type in ('income','divest') then t.amount_cents
                               when t.type in ('expense','invest') then -t.amount_cents else 0 end), 0) as total
      from transactions t join accounts a on a.id = t.account_id
      where a.currency = $1 and t.occurred_on <= (now() at time zone 'America/Lima')::date`,
      [moneda],
    );
    assert.equal(Number(crudo.total), total, msg(`en ${moneda}, la vista de saldos coincide con un recálculo directo`));
  }
  const [cruzadas] = await p.sql<{ n: number }>(`
    select count(*)::int n from transactions t
    join accounts a on a.id = t.account_id
    left join accounts d on d.id = t.to_account_id
    left join investments i on i.id = t.investment_id
    where d.currency <> a.currency or i.currency <> a.currency`);
  assert.equal(cruzadas.n, 0, msg("ninguna transferencia ni aporte mezcla monedas"));

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
  const meses = await p.sql<{ month: string; currency: "PEN" | "USD"; income_cents: number | null; expense_cents: number | null; invested_cents: number | null; divested_cents: number | null }>(
    "select * from monthly_summary order by month, currency",
  );
  for (const m of meses) {
    const desde = m.month;
    const hasta = new Date(Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7), 0)).toISOString().slice(0, 10);
    const e = libro.totales(desde, hasta < libro.hoy ? hasta : libro.hoy, m.currency);
    assert.deepEqual(
      [m.income_cents ?? 0, m.expense_cents ?? 0, m.invested_cents ?? 0, m.divested_cents ?? 0],
      [e.income, e.expense, e.invest, e.divest],
      msg(`resumen de ${desde.slice(0, 7)} en ${m.currency}`),
    );
  }

  // 5. Lo que lee la pantalla Resumen (consultas paginadas de la app + summarize/byCategory).
  //    Una moneda a la vez, como las muestra la app.
  const rows = await getReportRows(createFakeClient(p.db, p.user.id) as never, "2000-01-01", "2100-01-01");
  for (const moneda of CURRENCIES) {
    const enMoneda = rows.filter((r) => r.currency === moneda);
    const s = summarize(enMoneda);
    const todo = libro.totales("0000-01-01", "9999-12-31", moneda);
    assert.deepEqual([s.income, s.expense, s.invested, s.divested], [todo.income, todo.expense, todo.invest, todo.divest], msg(`reporte de la app en ${moneda}`));
    const egresos = libro.egresosPorCategoria("0000-01-01", "9999-12-31", moneda);
    for (const c of byCategory(enMoneda)) {
      assert.equal(c.cents, egresos.get(c.id) ?? 0, msg(`egresos de la categoría ${c.name} en ${moneda}`));
    }
  }
}
