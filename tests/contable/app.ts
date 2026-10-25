// "Persona" que usa la app llenando los formularios reales (las mismas Server Actions
// que llama la interfaz), y un "Libro" contable independiente que anota qué debería
// pasar con el dinero. Las pruebas comparan lo que dice la base contra el Libro.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { createAccount, setAccountActive, setDefaultAccount } from "@/app/(app)/cuentas/actions";
import { createCategory, setCategoryActive, updateCategory } from "@/app/(app)/categorias/actions";
import { deleteMovement, saveMovement } from "@/app/(app)/movimientos/actions";
import { generatePending, saveRecurring, toggleRecurring } from "@/app/(app)/movimientos/recurrentes/actions";
import { saveInvestment } from "@/app/(app)/inversiones/actions";
import { saveBudget } from "@/app/(app)/presupuesto/actions";
import { saveTargets } from "@/app/(app)/metricas/actions";
import type { ActionState } from "@/lib/action-state";
import { parseToCents } from "@/lib/money";
import type { AccountType, CategoryKind, TransactionType } from "@/lib/types";
import type { TestUser } from "./db";
import { signIn, signOut } from "./dobles/auth";
import { RedirectSignal } from "./dobles/next-navigation";
import { runAs } from "./fake-supabase";

// ---------------------------------------------------------------------------
// Libro contable independiente (el "oráculo")
// ---------------------------------------------------------------------------

export type Mov = {
  type: TransactionType;
  cents: number;
  date: string;
  account: string;
  to?: string | null;
  category?: string | null; // gasto/ingreso
  investment?: string | null; // aporte/rescate
};

export class Libro {
  cuentas = new Map<string, { inicial: number; tipo: AccountType; activa: boolean }>();
  categorias = new Map<string, { kind: CategoryKind; nombre: string; activa: boolean }>();
  inversiones = new Map<string, { categoria: string; capitalInicial: number }>();
  movimientos = new Map<string, Mov>(); // por id en la base
  valorizaciones = new Map<string, { date: string; cents: number }[]>(); // por inversión
  cuentaPorDefecto: string | null = null;

  constructor(public hoy: string) {}

  private efecto(m: Mov, cuenta: string): number {
    if (m.type === "transfer") return m.account === cuenta ? -m.cents : m.to === cuenta ? m.cents : 0;
    if (m.account !== cuenta) return 0;
    return m.type === "income" || m.type === "divest" ? m.cents : -m.cents;
  }

  // Saldo ejecutado: los movimientos con fecha futura todavía no tocan la cuenta.
  saldo(cuenta: string, hasta = this.hoy): number {
    let s = this.cuentas.get(cuenta)!.inicial;
    for (const m of this.movimientos.values()) if (m.date <= hasta) s += this.efecto(m, cuenta);
    return s;
  }

  totales(desde: string, hasta: string) {
    const t = { income: 0, expense: 0, invest: 0, divest: 0, transfer: 0 };
    for (const m of this.movimientos.values()) if (m.date >= desde && m.date <= hasta) t[m.type] += m.cents;
    return t;
  }

  categoriaEfectiva(m: Mov): string | null {
    return m.category ?? (m.investment ? this.inversiones.get(m.investment)!.categoria : null);
  }

  // Egresos (gasto + aportes) por categoría en un rango.
  egresosPorCategoria(desde: string, hasta: string) {
    const map = new Map<string, number>();
    for (const m of this.movimientos.values()) {
      if ((m.type !== "expense" && m.type !== "invest") || m.date < desde || m.date > hasta) continue;
      const c = this.categoriaEfectiva(m)!;
      map.set(c, (map.get(c) ?? 0) + m.cents);
    }
    return map;
  }

  aportadoNeto(inversion: string, hasta = "9999-12-31") {
    let n = 0;
    for (const m of this.movimientos.values()) {
      if (m.investment !== inversion || m.date > hasta) continue;
      n += m.type === "invest" ? m.cents : m.type === "divest" ? -m.cents : 0;
    }
    return n;
  }
}

// ---------------------------------------------------------------------------
// La persona que llena formularios
// ---------------------------------------------------------------------------

type Campos = Record<string, string | string[] | undefined>;

function form(campos: Campos) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) {
    if (v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v]) fd.append(k, item);
  }
  return fd;
}

export class Persona {
  libro: Libro;

  constructor(
    public db: PGlite,
    public user: TestUser,
    hoy: string,
  ) {
    this.libro = new Libro(hoy);
  }

  // Ejecuta una acción con la sesión de esta persona abierta.
  async enviar(accion: (prev: ActionState, fd: FormData) => Promise<ActionState>, campos: Campos): Promise<ActionState> {
    signIn(this.db, this.user);
    try {
      return await accion({}, form(campos));
    } catch (e) {
      if (e instanceof RedirectSignal) return { ok: true, message: "redirect:" + e.url };
      throw e;
    } finally {
      signOut();
    }
  }

  async debeFuncionar(accion: Parameters<Persona["enviar"]>[0], campos: Campos, que: string) {
    const r = await this.enviar(accion, campos);
    assert.ok(r.ok, `${que} debía guardarse y respondió: ${JSON.stringify(r)}`);
    return r;
  }

  // Consulta como esta persona (con RLS).
  async sql<T = Record<string, unknown>>(query: string, params: unknown[] = []) {
    return runAs(this.db, this.user.id, async (tx) => (await tx.query<T>(query, params)).rows);
  }

  // ----- cuentas y categorías -----

  async crearCuenta(nombre: string, tipo: AccountType, saldoInicial = "") {
    await this.debeFuncionar(createAccount, { name: nombre, type: tipo, initialBalance: saldoInicial }, `cuenta ${nombre}`);
    const [row] = await this.sql<{ id: string; initial_balance_cents: number }>(
      "select id, initial_balance_cents from accounts where name = $1",
      [nombre],
    );
    const cents = saldoInicial.trim() ? parseToCents(saldoInicial)! : 0;
    this.libro.cuentas.set(row.id, { inicial: tipo === "credit" ? -cents : cents, tipo, activa: true });
    if (!this.libro.cuentaPorDefecto) this.libro.cuentaPorDefecto = row.id; // la primera es la de defecto
    return row.id;
  }

  async usarPorDefecto(cuenta: string) {
    await this.debeFuncionar(setDefaultAccount, { id: cuenta }, "cuenta por defecto");
    this.libro.cuentaPorDefecto = cuenta;
  }

  async activarCuenta(cuenta: string, activa: boolean) {
    const r = await this.enviar(setAccountActive, { id: cuenta, active: String(activa) });
    if (r.ok) this.libro.cuentas.get(cuenta)!.activa = activa;
    return r;
  }

  async crearCategoria(nombre: string, kind: CategoryKind, color = "#2a78d6") {
    const existing = await this.sql<{ id: string }>("select id from categories where kind = $1 and lower(name) = lower($2)", [kind, nombre]);
    if (existing.length) {
      // Reutiliza una categoría que ya exista con ese nombre (por ejemplo, una predefinida antigua).
      this.libro.categorias.set(existing[0].id, { kind, nombre, activa: true });
      return existing[0].id;
    }
    await this.debeFuncionar(createCategory, { name: nombre, kind, color }, `categoría ${nombre}`);
    const [row] = await this.sql<{ id: string }>("select id from categories where kind = $1 and name = $2", [kind, nombre]);
    this.libro.categorias.set(row.id, { kind, nombre, activa: true });
    return row.id;
  }

  async renombrarCategoria(id: string, nombre: string) {
    await this.debeFuncionar(updateCategory, { id, name: nombre, color: "#eb6834" }, "renombrar categoría");
    this.libro.categorias.get(id)!.nombre = nombre;
  }

  async activarCategoria(id: string, activa: boolean) {
    await this.debeFuncionar(setCategoryActive, { id, active: String(activa) }, "activar/desactivar categoría");
    this.libro.categorias.get(id)!.activa = activa;
  }

  // ----- movimientos (formulario) -----

  /**
   * Llena el formulario de movimiento. `monto` va como texto, tal como lo escribe
   * una persona ("1500.50", "15.5", "20"). Si `fecha` o `cuenta` quedan vacías,
   * el Libro aplica la misma regla que promete la app: hoy y la cuenta por defecto.
   */
  async registrar(m: {
    tipo: "expense" | "income" | "transfer";
    monto: string;
    fecha?: string;
    cuenta?: string;
    hacia?: string;
    categoria?: string;
    descripcion?: string;
    requestId?: string;
  }) {
    const requestId = m.requestId ?? randomUUID();
    await this.debeFuncionar(
      saveMovement,
      {
        type: m.tipo,
        amount: m.monto,
        description: m.descripcion ?? "",
        categoryId: m.categoria ?? "",
        accountId: m.cuenta ?? "",
        toAccountId: m.hacia ?? "",
        occurredOn: m.fecha ?? "",
        requestId,
      },
      `${m.tipo} ${m.monto}`,
    );
    const rows = await this.sql<{ id: string }>("select id from transactions where request_id = $1", [requestId]);
    assert.equal(rows.length, 1, "cada envío del formulario crea exactamente un movimiento");
    const id = rows[0].id;
    if (!this.libro.movimientos.has(id)) {
      this.libro.movimientos.set(id, {
        type: m.tipo,
        cents: parseToCents(m.monto)!,
        date: m.fecha || this.libro.hoy,
        account: m.cuenta || this.libro.cuentaPorDefecto!,
        to: m.tipo === "transfer" ? m.hacia : null,
        category: m.tipo === "transfer" ? null : m.categoria,
      });
    }
    return id;
  }

  async editar(id: string, cambios: { monto?: string; fecha?: string; categoria?: string }) {
    const actual = this.libro.movimientos.get(id)!;
    const nuevo = {
      ...actual,
      cents: cambios.monto ? parseToCents(cambios.monto)! : actual.cents,
      date: cambios.fecha ?? actual.date,
      category: cambios.categoria ?? actual.category,
    };
    await this.debeFuncionar(
      saveMovement,
      {
        id,
        type: nuevo.type,
        amount: (nuevo.cents / 100).toFixed(2),
        description: "editado",
        categoryId: nuevo.category ?? "",
        accountId: nuevo.account,
        toAccountId: nuevo.to ?? "",
        occurredOn: nuevo.date,
      },
      "editar movimiento",
    );
    this.libro.movimientos.set(id, nuevo as Mov);
  }

  async borrar(id: string) {
    await this.debeFuncionar(deleteMovement, { id }, "borrar movimiento");
    this.libro.movimientos.delete(id);
  }

  // ----- recurrentes -----

  async crearRecurrente(r: {
    tipo: "expense" | "income" | "transfer";
    monto: string;
    descripcion: string;
    frecuencia: "weekly" | "monthly" | "yearly";
    inicio: string;
    fin?: string;
    categoria?: string;
    cuenta?: string;
    hacia?: string;
  }) {
    await this.debeFuncionar(
      saveRecurring,
      {
        id: "",
        type: r.tipo,
        amount: r.monto,
        description: r.descripcion,
        categoryId: r.categoria ?? "",
        accountId: r.cuenta ?? "",
        toAccountId: r.hacia ?? "",
        frequency: r.frecuencia,
        start: r.inicio,
        end: r.fin ?? "",
      },
      `recurrente ${r.descripcion}`,
    );
    const [row] = await this.sql<{ id: string }>("select id from recurring_rules where description = $1 order by created_at desc limit 1", [
      r.descripcion,
    ]);
    return row.id;
  }

  async pausarRecurrente(id: string, activa: boolean) {
    await this.debeFuncionar(toggleRecurring, { id, active: String(activa) }, "pausar/reanudar recurrente");
  }

  // Genera los recurrentes vencidos (botón "Procesar pendientes") y pasa al Libro
  // los movimientos nuevos. Quien llama verifica antes que sean los esperados.
  async procesarRecurrentes() {
    signIn(this.db, this.user);
    try {
      const r = await generatePending();
      assert.ok(r.ok, "procesar recurrentes: " + JSON.stringify(r));
    } finally {
      signOut();
    }
    const rows = await this.sql<{
      id: string;
      type: TransactionType;
      amount_cents: number;
      occurred_on: string;
      account_id: string;
      to_account_id: string | null;
      category_id: string | null;
    }>("select * from transactions where recurring_rule_id is not null");
    for (const t of rows) {
      if (this.libro.movimientos.has(t.id)) continue;
      this.libro.movimientos.set(t.id, {
        type: t.type,
        cents: t.amount_cents,
        date: t.occurred_on,
        account: t.account_id,
        to: t.to_account_id,
        category: t.category_id,
      });
    }
  }

  // ----- inversiones -----

  async invertir(op: { operacion: "invest" | "divest" | "valuation" | "opening"; monto: string; categoria?: string; inversion?: string; nombre?: string; cuenta?: string; fecha?: string; capitalInicial?: string }) {
    const requestId = randomUUID();
    await this.debeFuncionar(
      saveInvestment,
      {
        operation: op.operacion,
        requestId,
        investmentId: op.inversion ?? "",
        categoryId: op.categoria ?? "",
        accountId: op.cuenta ?? "",
        entryId: "",
        name: op.nombre ?? "",
        platform: "",
        description: op.operacion,
        date: op.fecha ?? "",
        amount: op.monto,
        initialCapital: op.capitalInicial ?? "",
      },
      `inversión ${op.operacion} ${op.monto}`,
    );
    const cents = parseToCents(op.monto)!;
    const date = op.fecha || this.libro.hoy;
    if (op.operacion === "invest" || op.operacion === "divest") {
      const [t] = await this.sql<{ id: string; investment_id: string }>("select id, investment_id from transactions where request_id = $1", [requestId]);
      if (!this.libro.inversiones.has(t.investment_id)) {
        this.libro.inversiones.set(t.investment_id, { categoria: op.categoria!, capitalInicial: 0 });
      }
      this.libro.movimientos.set(t.id, {
        type: op.operacion,
        cents,
        date,
        account: op.cuenta || this.libro.cuentaPorDefecto!,
        investment: t.investment_id,
      });
      return t.investment_id;
    }
    const inversion =
      op.inversion ?? (await this.sql<{ id: string }>("select id from investments where request_id = $1", [requestId]))[0].id;
    if (!this.libro.inversiones.has(inversion)) {
      this.libro.inversiones.set(inversion, {
        categoria: op.categoria!,
        capitalInicial: op.operacion === "opening" && op.capitalInicial ? parseToCents(op.capitalInicial)! : 0,
      });
    }
    const vals = this.libro.valorizaciones.get(inversion) ?? [];
    this.libro.valorizaciones.set(inversion, [...vals.filter((v) => v.date !== date), { date, cents }]);
    return inversion;
  }

  // ----- presupuesto y metas -----

  async presupuestar(mes: string, total: string, porcentajes: Record<string, string>) {
    const campos: Campos = { month: mes, total };
    for (const [cat, pct] of Object.entries(porcentajes)) campos["pct_" + cat] = pct;
    await this.debeFuncionar(saveBudget, campos, `presupuesto ${mes}`);
  }

  async definirMetas(mes: string, metas: { ahorro: string; inversion: string; meses: string; cuentas: string[] }) {
    await this.debeFuncionar(
      saveTargets,
      { month: mes, savingsRate: metas.ahorro, monthlyInvestment: metas.inversion, emergencyMonths: metas.meses, emergencyAccount: metas.cuentas },
      "metas",
    );
  }
}
