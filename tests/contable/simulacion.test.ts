// Simulación: dos personas usan la app día a día durante ~2.5 años, llenando los
// formularios reales con montos enteros o con punto decimal, transferencias, pagos de
// tarjeta, inversiones, recurrentes, presupuestos, ediciones, borrados, dobles clics,
// categorías renombradas y deshabilitadas. Al cierre de cada mes se verifica que todo
// cuadre contra el Libro independiente.
//
// Es reproducible: usa una semilla fija. Para probar otra: SEMILLA=123 npm run test:contable
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { addDays, addMonths } from "@/lib/dashboard";
import {
  averageMonthlyExpense,
  categoryChanges,
  evaluateHistory,
  monthContext,
  projectMonth,
  streak,
  targetsFor,
  type MonthSummary,
  type TargetRow,
} from "@/lib/metrics";
import { getReportRows } from "@/lib/finance-data";
import { Persona } from "./app";
import { createTestDb, createUser, dbToday } from "./db";
import { createFakeClient } from "./fake-supabase";
import { cuadrar } from "./verificar";

const SEMILLA = Number(process.env.SEMILLA ?? 20261024);

// Generador pseudoaleatorio con semilla (mulberry32): mismos datos en cada corrida.
function azar(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    entre: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    uno: <T,>(xs: T[]) => xs[Math.floor(next() * xs.length)],
    si: (p: number) => next() < p,
  };
}

// Montos escritos como lo haría una persona (todos significan lo mismo).
function escribir(cents: number, r: ReturnType<typeof azar>) {
  const soles = (cents / 100).toFixed(2);
  const [entero, dec] = soles.split(".");
  return r.uno([soles, dec === "00" ? entero : soles, dec.endsWith("0") ? `${entero}.${dec[0]}` : soles]);
}

// Calendario esperado de una regla recurrente, calculado aquí (no con el código de la app).
function ocurrencias(inicio: string, frecuencia: "weekly" | "monthly" | "yearly", hasta: string, fin?: string) {
  const out: string[] = [];
  const [y, m, d] = inicio.split("-").map(Number);
  for (let k = 0; k < 2000; k++) {
    let fecha: string;
    if (frecuencia === "weekly") fecha = addDays(inicio, 7 * k);
    else {
      const meses = frecuencia === "monthly" ? k : 12 * k;
      const yy = y + Math.floor((m - 1 + meses) / 12);
      const mm = ((m - 1 + meses) % 12) + 1;
      const ultimo = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
      fecha = `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
    }
    if (fecha > hasta || (fin && fecha > fin)) break;
    out.push(fecha);
  }
  return out;
}

describe(`Simulación contable de ~2.5 años (semilla ${SEMILLA})`, () => {
  let ana: Persona;
  let beto: Persona;
  let hoy: string;
  const r = azar(SEMILLA);
  const c: Record<string, string> = {};
  const metas: TargetRow[] = [];
  const reglas: { id: string; inicio: string; frecuencia: "weekly" | "monthly" | "yearly"; fin?: string; cents: number }[] = [];
  const formulario: string[] = []; // ids de movimientos creados por formulario (editables)
  let inicio: string;

  before(async () => {
    const db = await createTestDb();
    hoy = await dbToday(db);
    inicio = addMonths(hoy.slice(0, 7) + "-01", -30);
    ana = new Persona(db, await createUser(db, "ana@ejemplo.com"), hoy);
    beto = new Persona(db, await createUser(db, "beto@ejemplo.com"), hoy);

    // --- Ana: cuentas y categorías ---
    c.efectivo = await ana.crearCuenta("Efectivo", "cash", "300");
    c.bcp = await ana.crearCuenta("BCP Débito", "debit", "2500.00");
    c.interbank = await ana.crearCuenta("Interbank", "debit", "");
    c.visa = await ana.crearCuenta("Visa", "credit", "350.75");
    c.ahorro = await ana.crearCuenta("Ahorro", "savings", "5000");
    await ana.usarPorDefecto(c.bcp);
    for (const [k, n, kind] of [
      ["sueldo", "Sueldo", "income"],
      ["freelance", "Freelance", "income"],
      ["comida", "Comida", "expense"],
      ["transporte", "Transporte", "expense"],
      ["renta", "Renta", "expense"],
      ["servicios", "Servicios", "expense"],
      ["ocio", "Entretenimiento", "expense"],
      ["salud", "Salud", "expense"],
      ["ropa", "Ropa", "expense"],
      ["fondos", "Fondos mutuos", "investment"],
      ["acciones", "Acciones", "investment"],
    ] as const) {
      c[k] = await ana.crearCategoria(n, kind);
    }

    // --- Ana: recurrentes (incluye día 31, día 30 y fin de mes en febrero) ---
    const regla = async (desc: string, tipo: "expense" | "income" | "transfer", cents: number, frecuencia: "weekly" | "monthly" | "yearly", dia: string, extra: Record<string, string> = {}, fin?: string) => {
      const id = await ana.crearRecurrente({ tipo, monto: (cents / 100).toFixed(2), descripcion: desc, frecuencia, inicio: dia, fin, ...extra });
      reglas.push({ id, inicio: dia, frecuencia, fin, cents });
    };
    const ym = inicio.slice(0, 8);
    await regla("Sueldo", "income", 650000, "monthly", ym + "30", { categoria: c.sueldo, cuenta: c.bcp });
    await regla("Renta", "expense", 180000, "monthly", ym + "01", { categoria: c.renta, cuenta: c.bcp });
    await regla("Netflix", "expense", 4490, "monthly", lastDay(inicio), { categoria: c.ocio, cuenta: c.visa }); // último día del mes
    await regla("Menú semanal", "expense", 6500, "weekly", ym + "03", { categoria: c.comida, cuenta: c.efectivo });
    await regla("Ahorro automático", "transfer", 50000, "monthly", ym + "05", { cuenta: c.bcp, hacia: c.ahorro });
    await regla("Seguro anual", "expense", 120000, "yearly", ym + "15", { categoria: c.salud, cuenta: c.bcp });
    await regla("Gimnasio", "expense", 9900, "monthly", ym + "10", { categoria: c.salud, cuenta: c.visa }, addMonths(inicio, 6));

    // --- Beto: otra persona en la misma base ---
    c.betoCaja = await beto.crearCuenta("Caja", "cash", "100");
    c.betoBanco = await beto.crearCuenta("Banco", "debit", "800");
    c.betoComida = await beto.crearCategoria("Comida", "expense");
    c.betoSueldo = await beto.crearCategoria("Sueldo", "income");
  });

  function lastDay(iso: string) {
    return new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)).toISOString().slice(0, 10);
  }

  it("mes a mes, todo cuadra con el Libro", async () => {
    const gastos = ["comida", "transporte", "servicios", "ocio", "salud", "ropa"];
    const rango: Record<string, [number, number]> = {
      comida: [800, 9000],
      transporte: [350, 4500],
      servicios: [3000, 25000],
      ocio: [1500, 18000],
      salud: [2000, 40000],
      ropa: [3000, 30000],
    };
    let ropaActiva = true;
    let interbankActiva = true;
    const inversiones: Record<string, string> = {};

    for (let mes = inicio; mes <= hoy; mes = addMonths(mes, 1)) {
      const mesN = Math.round((Date.parse(mes) - Date.parse(inicio)) / (30.44 * 864e5));

      // Presupuesto y metas al empezar el mes (como haría alguien organizado).
      if (r.si(0.8)) {
        const total = escribir(r.entre(300000, 600000), r);
        const pcts = { [c.comida]: String(r.entre(10, 25)), [c.renta]: "35", [c.ocio]: String(r.entre(3, 10)), [c.fondos]: String(r.entre(5, 15)) };
        await ana.presupuestar(mes.slice(0, 7), total, pcts);
      }
      if (mesN % 6 === 0) {
        const t = { ahorro: String(r.entre(10, 30)), inversion: String(r.entre(1, 6) * 100), meses: String(r.entre(3, 8)) };
        await ana.definirMetas(mes.slice(0, 7), { ...t, cuentas: [c.efectivo, c.bcp, c.ahorro] });
        metas.push({ effective_month: mes, savings_rate_bps: Number(t.ahorro) * 100, monthly_investment_cents: Number(t.inversion) * 100, emergency_months: Number(t.meses) });
      }

      // Cambios de catálogo a mitad de la historia: no deben mover un solo céntimo.
      if (mesN === 10) await ana.renombrarCategoria(c.ocio, "Ocio y salidas");
      if (mesN === 14) {
        await ana.activarCategoria(c.ropa, false);
        ropaActiva = false;
      }
      if (mesN === 18) {
        // Cerrar Interbank: dejarla en cero con una transferencia y deshabilitarla.
        const saldo = ana.libro.saldo(c.interbank, "9999-12-31");
        if (saldo !== 0) {
          await ana.registrar({ tipo: "transfer", monto: escribir(Math.abs(saldo), r), fecha: mes, cuenta: saldo > 0 ? c.interbank : c.bcp, hacia: saldo > 0 ? c.bcp : c.interbank, descripcion: "Cierre Interbank" });
        }
        assert.equal(ana.libro.saldo(c.interbank, "9999-12-31"), 0);
        const r2 = await ana.activarCuenta(c.interbank, false);
        assert.ok(r2.ok, "deshabilitar Interbank");
        interbankActiva = false;
      }

      const finMes = lastDay(mes) < hoy ? lastDay(mes) : hoy;
      for (let dia = mes; dia <= finMes; dia = addDays(dia, 1)) {
        const cuentas = [c.efectivo, c.bcp, c.visa, ...(interbankActiva ? [c.interbank] : [])];

        // Gastos del día.
        for (let i = r.entre(0, 2); i > 0; i--) {
          const cat = r.uno(gastos.filter((g) => g !== "ropa" || ropaActiva));
          const cents = r.entre(...rango[cat]);
          const sinCuenta = cents < 3000 && r.si(0.3); // gasto rápido: sin elegir cuenta
          const id = await ana.registrar({
            tipo: "expense",
            monto: escribir(cents, r),
            fecha: dia,
            cuenta: sinCuenta ? undefined : r.uno(cuentas),
            categoria: c[cat],
            descripcion: cat,
          });
          formulario.push(id);
        }

        if (r.si(0.04)) {
          formulario.push(await ana.registrar({ tipo: "income", monto: escribir(r.entre(20000, 150000), r), fecha: dia, cuenta: r.uno([c.bcp, ...(interbankActiva ? [c.interbank] : [])]), categoria: c.freelance, descripcion: "Proyecto" }));
        }

        // Pagar la tarjeta: transferencia por la deuda que tenga ese día.
        const deuda = -ana.libro.saldo(c.visa, dia);
        if (deuda > 0 && r.si(0.06)) {
          await ana.registrar({ tipo: "transfer", monto: escribir(deuda, r), fecha: dia, cuenta: c.bcp, hacia: c.visa, descripcion: "Pago Visa" });
        }
        if (r.si(0.03)) {
          const [de, a] = r.si(0.5) ? [c.bcp, c.ahorro] : [c.ahorro, c.bcp];
          await ana.registrar({ tipo: "transfer", monto: escribir(r.entre(5000, 80000), r), fecha: dia, cuenta: de, hacia: a, descripcion: "Movimiento entre cuentas" });
        }

        // Inversiones: aportes, rescates parciales y valorizaciones.
        if (r.si(0.04)) {
          const cat = r.uno(["fondos", "acciones"]);
          const inv = await ana.invertir({ operacion: "invest", monto: escribir(r.entre(10000, 80000), r), categoria: c[cat], nombre: cat === "fondos" ? "Fondo BCP" : "Cartera ETF", inversion: inversiones[cat], cuenta: c.bcp, fecha: dia });
          inversiones[cat] = inv;
        }
        for (const inv of Object.values(inversiones)) {
          const neto = ana.libro.aportadoNeto(inv, dia);
          if (neto > 5000 && r.si(0.008)) await ana.invertir({ operacion: "divest", monto: escribir(r.entre(1000, Math.floor(neto / 2)), r), inversion: inv, cuenta: c.bcp, fecha: dia });
        }

        // Errores humanos: corregir un monto, borrar algo, hacer doble clic.
        if (formulario.length && r.si(0.03)) {
          const id = r.uno(formulario);
          if (ana.libro.movimientos.has(id)) await ana.editar(id, { monto: escribir(r.entre(500, 20000), r) });
        }
        if (formulario.length > 5 && r.si(0.015)) {
          const id = formulario.splice(r.entre(0, formulario.length - 1), 1)[0];
          if (ana.libro.movimientos.has(id)) await ana.borrar(id);
        }
        if (r.si(0.01)) {
          const requestId = crypto.randomUUID();
          const datos = { tipo: "expense" as const, monto: "12.30", fecha: dia, cuenta: c.efectivo, categoria: c.comida, descripcion: "Doble clic", requestId };
          await ana.registrar(datos);
          await ana.registrar(datos); // el segundo envío no debe duplicar
        }

        // Beto usa la app a su ritmo (su dinero nunca debe afectar el de Ana).
        if (r.si(0.25)) await beto.registrar({ tipo: "expense", monto: escribir(r.entre(500, 6000), r), fecha: dia, cuenta: r.uno([c.betoCaja, c.betoBanco]), categoria: c.betoComida });
        if (dia.endsWith("-15")) await beto.registrar({ tipo: "income", monto: "1200.00", fecha: dia, cuenta: c.betoBanco, categoria: c.betoSueldo });
      }

      // Valorización de fin de mes de cada inversión.
      for (const inv of Object.values(inversiones)) {
        const neto = ana.libro.aportadoNeto(inv, finMes);
        await ana.invertir({ operacion: "valuation", monto: escribir(Math.max(0, Math.round(neto * (0.95 + r.next() * 0.13))), r), inversion: inv, fecha: finMes });
      }

      // Cierre de mes: aún sin recurrentes (se generan al final), lo registrado debe cuadrar.
      await cuadrar(ana, `Ana ${mes.slice(0, 7)} (sin recurrentes)`);
    }

    // Movimientos programados a futuro: existen, pero no tocan el saldo ejecutado.
    await ana.registrar({ tipo: "expense", monto: "250", fecha: addDays(hoy, 3), cuenta: c.bcp, categoria: c.servicios, descripcion: "Programado" });

    // Recurrentes: la app genera de una vez todo lo pendiente desde el inicio.
    await ana.procesarRecurrentes();
    for (const regla of reglas) {
      const esperado = ocurrencias(regla.inicio, regla.frecuencia, hoy, regla.fin);
      const enBase = await ana.sql<{ occurred_on: string; amount_cents: number }>(
        "select occurred_on, amount_cents from transactions where recurring_rule_id = $1 order by occurred_on",
        [regla.id],
      );
      assert.deepEqual(enBase.map((t) => t.occurred_on), esperado, `calendario de la regla que empieza ${regla.inicio} (${regla.frecuencia})`);
      assert.ok(enBase.every((t) => t.amount_cents === regla.cents), "cada ocurrencia por el monto de la regla");
    }
    const antes = ana.libro.movimientos.size;
    await ana.procesarRecurrentes(); // segunda corrida: idempotente
    assert.equal(ana.libro.movimientos.size, antes, "procesar dos veces no duplica recurrentes");

    await cuadrar(ana, "Ana final (con recurrentes)");
    await cuadrar(beto, "Beto final");

    const porTipo = new Map<string, number>();
    for (const m of ana.libro.movimientos.values()) porTipo.set(m.type, (porTipo.get(m.type) ?? 0) + 1);
    console.log(
      `Simulados ${Math.round((Date.parse(hoy) - Date.parse(inicio)) / 864e5)} días desde ${inicio}: ` +
        `Ana ${ana.libro.movimientos.size} movimientos (${[...porTipo].map(([t, n]) => `${t} ${n}`).join(", ")}), ` +
        `Beto ${beto.libro.movimientos.size}, ${reglas.length} reglas recurrentes, ${metas.length} cambios de metas.`,
    );
  });

  it("las métricas de cada mes cerrado salen de los mismos números del Libro", async () => {
    const summary = await ana.sql<{ month: string; income_cents: number | null; expense_cents: number | null; invested_cents: number | null; divested_cents: number | null }>(
      "select * from monthly_summary order by month",
    );
    const history: MonthSummary[] = summary.map((m) => ({
      month: m.month.slice(0, 7),
      income: m.income_cents ?? 0,
      expense: m.expense_cents ?? 0,
      invested: m.invested_cents ?? 0,
      divested: m.divested_cents ?? 0,
    }));
    const dbTargets = await ana.sql<TargetRow>("select * from financial_targets order by effective_month");
    assert.equal(dbTargets.length, metas.length, "metas guardadas");
    const results = evaluateHistory(history, dbTargets);
    const actual = hoy.slice(0, 7);

    let rachaAhorro = 0;
    let cortada = false;
    for (const res of results.filter((x) => x.month < actual)) {
      const desde = res.month + "-01";
      const e = ana.libro.totales(desde, lastDay(desde));
      const tasa = e.income ? (e.income - e.expense) / e.income : null;
      assert.equal(res.savingsRate, tasa, `tasa de ahorro ${res.month}`);
      const meta = targetsFor(res.month, metas);
      const cumplio = tasa === null ? null : tasa >= meta.savingsRateBps / 10000;
      assert.equal(res.savingsMet, cumplio, `meta de ahorro ${res.month}`);
      assert.equal(res.investmentMet, meta.monthlyInvestmentCents > 0 ? e.invest - e.divest >= meta.monthlyInvestmentCents : null, `meta de inversión ${res.month}`);
      if (!cortada && cumplio) rachaAhorro++;
      else cortada = true;

      // Proyección de un mes cerrado = lo real.
      const rows = await getReportRows(createFakeClient(ana.db, ana.user.id) as never, desde, addMonths(desde, 1));
      const proj = projectMonth(rows, [], [], monthContext(res.month, hoy));
      assert.deepEqual([proj.income.projected, proj.expense.projected, proj.invest.projected], [e.income, e.expense, e.invest], `proyección de ${res.month}`);
    }
    assert.equal(streak(results, "savingsMet", actual), rachaAhorro, "racha de ahorro");

    // Fondo de emergencia: gasto promedio de los 3 últimos meses cerrados.
    const cerrados = history.filter((h) => h.month < actual).slice(-3);
    assert.equal(averageMonthlyExpense(history, actual), Math.round(cerrados.reduce((s, h) => s + h.expense, 0) / cerrados.length));

    // Comparación por categoría del último mes cerrado contra el promedio de los 3 anteriores.
    const ultimo = addMonths(actual + "-01", -1).slice(0, 7);
    const rows = await getReportRows(createFakeClient(ana.db, ana.user.id) as never, addMonths(ultimo + "-01", -3), addMonths(ultimo + "-01", 1));
    const cambios = categoryChanges(rows, monthContext(ultimo, hoy));
    for (const cat of cambios.all) {
      const actualMes = gastoCategoria(ana, cat.id, ultimo + "-01");
      const previos = [1, 2, 3].map((k) => gastoCategoria(ana, cat.id, addMonths(ultimo + "-01", -k)));
      assert.equal(cat.current, actualMes, `gasto de ${cat.name} en ${ultimo}`);
      assert.equal(cat.average, Math.round(previos.reduce((a, b) => a + b, 0) / 3), `promedio de ${cat.name}`);
    }
  });

  it("Beto y Ana no ven ni mueven el dinero del otro", async () => {
    const deAna = await beto.sql("select * from transactions where user_id = $1", [ana.user.id]);
    assert.equal(deAna.length, 0, "Beto no ve movimientos de Ana");
    const cuentasVistas = await beto.sql<{ account_id: string }>("select account_id from account_balances");
    assert.deepEqual(new Set(cuentasVistas.map((x) => x.account_id)), new Set([c.betoCaja, c.betoBanco]));
  });

  function gastoCategoria(p: Persona, cat: string, mesInicio: string) {
    let s = 0;
    for (const m of p.libro.movimientos.values()) {
      if (m.type === "expense" && m.category === cat && m.date >= mesInicio && m.date < addMonths(mesInicio, 1)) s += m.cents;
    }
    return s;
  }
});
