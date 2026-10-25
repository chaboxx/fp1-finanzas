// Scripts para eliminar categorías predefinidas: borran solo las creadas en bloque
// por la app que no se usan; nunca las tuyas ni las que tienen historial; y el
// dinero no cambia ni un céntimo.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { before, describe, it } from "node:test";
import { Persona } from "./app";
import { createTestDb, createUser, dbToday } from "./db";
import { cuadrar } from "./verificar";

const leer = (f: string) => readFileSync(join(import.meta.dirname, "..", "..", "scripts", f), "utf8");
const VISTA_PREVIA = leer("categorias-predefinidas-1-vista-previa.sql");
const ELIMINAR = leer("categorias-predefinidas-2-eliminar.sql");

const PREDEFINIDAS = [
  ["food", "Alimentación", "expense"],
  ["home", "Vivienda", "expense"],
  ["transport", "Transporte", "expense"],
  ["services", "Servicios", "expense"],
  ["health", "Salud", "expense"],
  ["fun", "Entretenimiento", "expense"],
  ["shopping", "Compras", "expense"],
  ["other-expense", "Otros gastos", "expense"],
  ["other-income", "Otros ingresos", "income"],
  ["sp500", "S&P 500", "investment"],
  ["crypto", "Cripto", "investment"],
  ["deposits", "Depósitos", "investment"],
  ["other-investment", "Otras inversiones", "investment"],
] as const;

describe("Eliminar categorías predefinidas", () => {
  let ana: Persona;
  let beto: Persona;
  const id: Record<string, string> = {};

  // Reproduce lo que hizo la migración 20261027000000: crear las 14 en bloque
  // (misma transacción) y "adoptar" la categoría Sueldo que la persona ya tenía.
  async function sembrar(p: Persona, sueldoPropio: string | null) {
    await p.db.transaction(async (tx) => {
      for (const [key, name, kind] of PREDEFINIDAS) {
        await tx.query("insert into public.categories (user_id, seed_key, name, kind, color) values ($1, $2, $3, $4, '#2a78d6')", [p.user.id, key, name, kind]);
      }
      if (sueldoPropio) await tx.query("update public.categories set seed_key = 'salary' where id = $1", [sueldoPropio]);
      else await tx.query("insert into public.categories (user_id, seed_key, name, kind) values ($1, 'salary', 'Sueldo', 'income')", [p.user.id]);
    });
    const rows = await p.sql<{ id: string; seed_key: string }>("select id, seed_key from categories where seed_key is not null");
    return Object.fromEntries(rows.map((r) => [r.seed_key, r.id]));
  }

  before(async () => {
    const db = await createTestDb();
    const hoy = await dbToday(db);
    ana = new Persona(db, await createUser(db, "ana@ejemplo.com"), hoy);
    beto = new Persona(db, await createUser(db, "beto@ejemplo.com"), hoy);

    id.banco = await ana.crearCuenta("Banco", "debit", "2000");
    id.sueldoPropio = await ana.crearCategoria("Sueldo", "income"); // la creó Ana antes de la migración
    id.mia = await ana.crearCategoria("Mascotas", "expense");
    const s = await sembrar(ana, id.sueldoPropio);
    Object.assign(id, s);

    // Ana usa algunas predefinidas.
    await ana.registrar({ tipo: "income", monto: "3000", fecha: "2025-08-01", cuenta: id.banco, categoria: id.sueldoPropio });
    await ana.registrar({ tipo: "expense", monto: "45.90", fecha: "2025-08-02", cuenta: id.banco, categoria: id.food });
    await ana.presupuestar("2025-08", "2000", { [id.home]: "40" });
    await ana.crearRecurrente({ tipo: "expense", monto: "80", descripcion: "Luz", frecuencia: "monthly", inicio: "2025-08-15", fin: "2025-09-30", categoria: id.services, cuenta: id.banco });
    await ana.procesarRecurrentes();
    await ana.invertir({ operacion: "invest", monto: "300", categoria: id.sp500, nombre: "ETF", cuenta: id.banco, fecha: "2025-08-20" });

    await beto.crearCuenta("Caja", "cash", "100");
    id.betoPropia = await beto.crearCategoria("Gimnasio", "expense");
    await sembrar(beto, null);
  });

  it("la vista previa explica qué pasará con cada una y no cambia nada", async () => {
    const antes = (await ana.db.query("select count(*)::int n from public.categories")).rows;
    const filas = (await ana.db.query<{ usuario: string; categoria: string; que_pasara: string }>(VISTA_PREVIA)).rows;
    const deAna = Object.fromEntries(filas.filter((f) => f.usuario === "ana@ejemplo.com").map((f) => [f.categoria, f.que_pasara]));
    assert.equal(deAna["Sueldo"], "SE CONSERVA: la creaste tú");
    assert.equal(deAna["Alimentación"], "SE CONSERVA: está en uso (1 movimientos)");
    assert.equal(deAna["Vivienda"], "SE CONSERVA: está en uso (1 presupuestos)");
    assert.match(deAna["Servicios"], /^SE CONSERVA: está en uso \(\d+ movimientos, 1 recurrentes\)$/);
    assert.equal(deAna["S&P 500"], "SE CONSERVA: está en uso (1 inversiones)");
    assert.equal(deAna["Cripto"], "SE BORRA");
    assert.equal(deAna["Mascotas"], undefined, "las categorías sin marca de predefinida ni aparecen");
    assert.deepEqual((await ana.db.query("select count(*)::int n from public.categories")).rows, antes);
  });

  it("borra solo las predefinidas sin uso; tus categorías y el historial quedan intactos", async () => {
    await cuadrar(ana, "antes de borrar");
    await cuadrar(beto, "antes de borrar");
    const borradas = (await ana.db.query<{ usuario: string; categoria_borrada: string }>(ELIMINAR)).rows;

    const deAna = borradas.filter((b) => b.usuario === "ana@ejemplo.com").map((b) => b.categoria_borrada).sort();
    assert.deepEqual(deAna, ["Cripto", "Compras", "Depósitos", "Entretenimiento", "Otras inversiones", "Otros gastos", "Otros ingresos", "Salud", "Transporte"].sort());
    assert.equal(borradas.filter((b) => b.usuario === "beto@ejemplo.com").length, 14, "Beto no usaba ninguna");

    const quedanAna = (await ana.sql<{ name: string }>("select name from categories order by name")).map((r) => r.name);
    assert.deepEqual(quedanAna, ["Alimentación", "Mascotas", "S&P 500", "Servicios", "Sueldo", "Vivienda"]);
    const quedanBeto = (await beto.sql<{ name: string }>("select name from categories")).map((r) => r.name);
    assert.deepEqual(quedanBeto, ["Gimnasio"]);

    await cuadrar(ana, "después de borrar");
    await cuadrar(beto, "después de borrar");
  });

  it("ejecutarlo otra vez no borra nada más", async () => {
    const otra = (await ana.db.query(ELIMINAR)).rows;
    assert.equal(otra.length, 0);
  });

  it("un usuario nuevo ya no recibe categorías predefinidas", async () => {
    const nueva = await createUser(ana.db, "nueva@ejemplo.com");
    const cats = await ana.db.query("select * from public.categories where user_id = $1", [nueva.id]);
    assert.equal(cats.rows.length, 0);
  });
});
