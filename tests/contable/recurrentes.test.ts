// Recurrentes: el calendario debe ser exacto durante años (fin de mes, febrero,
// bisiestos), nunca duplicar, y respetar pausa, fin y ediciones.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { saveRecurring } from "@/app/(app)/movimientos/recurrentes/actions";
import { Persona } from "./app";
import { createTestDb, createUser, dbToday } from "./db";
import { cuadrar } from "./verificar";

describe("Recurrentes durante años", () => {
  let p: Persona;
  const id: Record<string, string> = {};

  before(async () => {
    const db = await createTestDb();
    p = new Persona(db, await createUser(db, "ana@ejemplo.com"), await dbToday(db));
    id.banco = await p.crearCuenta("Banco", "debit", "1000");
    id.ahorro = await p.crearCuenta("Ahorro", "savings", "0");
    id.renta = await p.crearCategoria("Renta", "expense");
    id.sueldo = await p.crearCategoria("Sueldo", "income");
  });

  const fechas = async (regla: string) =>
    (await p.sql<{ occurred_on: string }>("select occurred_on from transactions where recurring_rule_id = $1 order by occurred_on", [regla])).map(
      (r) => r.occurred_on,
    );

  it("mensual el día 31: febrero cae en su último día (incluido bisiesto) y vuelve al 31", async () => {
    const regla = await p.crearRecurrente({ tipo: "expense", monto: "100", descripcion: "Día 31", frecuencia: "monthly", inicio: "2024-01-31", fin: "2024-06-30", categoria: id.renta, cuenta: id.banco });
    await p.procesarRecurrentes();
    assert.deepEqual(await fechas(regla), ["2024-01-31", "2024-02-29", "2024-03-31", "2024-04-30", "2024-05-31", "2024-06-30"]);
  });

  it("anual desde un 29 de febrero: 28 en años normales y 29 en los bisiestos", async () => {
    const regla = await p.crearRecurrente({ tipo: "income", monto: "50", descripcion: "Aniversario", frecuencia: "yearly", inicio: "2020-02-29", fin: "2025-12-31", categoria: id.sueldo, cuenta: id.banco });
    await p.procesarRecurrentes();
    assert.deepEqual(await fechas(regla), ["2020-02-29", "2021-02-28", "2022-02-28", "2023-02-28", "2024-02-29", "2025-02-28"]);
  });

  it("semanal durante dos años: 105 ocurrencias exactas, una por semana", async () => {
    const regla = await p.crearRecurrente({ tipo: "transfer", monto: "10", descripcion: "Ahorro semanal", frecuencia: "weekly", inicio: "2023-01-02", fin: "2024-12-30", cuenta: id.banco, hacia: id.ahorro });
    await p.procesarRecurrentes();
    const f = await fechas(regla);
    assert.equal(f.length, 105);
    assert.ok(f.every((d, i) => i === 0 || Date.parse(d) - Date.parse(f[i - 1]) === 7 * 864e5));
  });

  it("procesar muchas veces no duplica nada y el dinero sigue cuadrando", async () => {
    const antes = (await p.sql("select id from transactions")).length;
    for (let i = 0; i < 3; i++) await p.procesarRecurrentes();
    assert.equal((await p.sql("select id from transactions")).length, antes);
    await cuadrar(p, "recurrentes procesados varias veces");
  });

  it("editar el monto de una regla no cambia los movimientos ya creados", async () => {
    const regla = await p.crearRecurrente({ tipo: "expense", monto: "300", descripcion: "Internet", frecuencia: "monthly", inicio: "2025-01-05", fin: "2025-03-31", categoria: id.renta, cuenta: id.banco });
    await p.procesarRecurrentes();
    const [r] = await p.sql<Record<string, string>>("select * from recurring_rules where id = $1", [regla]);
    await p.debeFuncionar(
      saveRecurring,
      { id: regla, type: "expense", amount: "999", description: "Internet", categoryId: id.renta, accountId: id.banco, toAccountId: "", frequency: "monthly", start: r.start_on, end: r.end_on ?? "" },
      "editar regla",
    );
    const montos = await p.sql<{ amount_cents: number }>("select amount_cents from transactions where recurring_rule_id = $1", [regla]);
    assert.deepEqual(montos.map((m) => m.amount_cents), [30000, 30000, 30000]);
  });

  it("una regla pausada no genera; al reanudarla se ponen al día las fechas pendientes", async () => {
    // Comportamiento actual: la pausa "congela" la regla y al reanudar se crean las
    // ocurrencias que vencieron mientras estuvo pausada. Si prefieres que se salten,
    // es una decisión de producto: este test la documenta.
    const regla = await p.crearRecurrente({ tipo: "expense", monto: "20", descripcion: "Pausable", frecuencia: "monthly", inicio: "2025-06-01", fin: "2025-09-30", categoria: id.renta, cuenta: id.banco });
    await p.pausarRecurrente(regla, false);
    await p.procesarRecurrentes();
    assert.deepEqual(await fechas(regla), []);
    await p.pausarRecurrente(regla, true);
    await p.procesarRecurrentes();
    assert.deepEqual(await fechas(regla), ["2025-06-01", "2025-07-01", "2025-08-01", "2025-09-01"]);
    await cuadrar(p, "después de reanudar");
  });
});
