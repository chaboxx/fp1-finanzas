# Pruebas contables

Objetivo: tener la seguridad de que **el dinero no aparece ni desaparece**, que los saldos,
resúmenes, presupuestos, inversiones, recurrentes y métricas cuadran hoy y dentro de años.

Hay dos herramientas:

| Herramienta | Qué prueba | Cuándo |
|---|---|---|
| `npm run test:contable` | La app completa contra un Postgres en memoria con todas las migraciones | Antes de cada cambio de código o migración (y en CI) |
| [`scripts/auditoria.sql`](../scripts/auditoria.sql) | Tus datos reales en Supabase | Una vez al mes y antes/después de cada migración |

## 1. `npm run test:contable`

### Cómo funciona

Las pruebas **llenan los formularios reales de la app**: llaman a las mismas Server Actions que
usa la interfaz (crear cuenta, registrar gasto, transferir, invertir, presupuestar, recurrentes,
metas…). Corren contra Postgres (PGlite) con **todas** las migraciones, triggers, CHECKs y RLS.
Solo se reemplazan dos piezas por dobles de prueba ([`tests/contable/dobles/`](../tests/contable/dobles)):

- la sesión (`@/lib/auth`): en vez de leer la cookie, usa a la persona que abre la prueba;
- la conexión a Supabase: un cliente mínimo ([`fake-supabase.ts`](../tests/contable/fake-supabase.ts))
  que traduce las llamadas de supabase-js a SQL, ejecutado **como ese usuario** (con RLS).

En paralelo, un **Libro contable independiente** ([`app.ts`](../tests/contable/app.ts)) anota lo
que cada operación *debería* hacer con el dinero. Luego [`verificar.ts`](../tests/contable/verificar.ts)
compara la base contra el Libro.

### Las invariantes (lo que siempre debe cumplirse)

1. **Saldo de cada cuenta** = saldo inicial + ingresos + rescates − gastos − aportes ± transferencias
   (solo lo ejecutado: lo programado a futuro aún no cuenta).
2. **Conservación**: la suma de todas las cuentas = saldos iniciales + ingresos + rescates − gastos
   − aportes. Las transferencias se anulan entre sí. Se calcula de dos formas independientes.
3. **Mismos movimientos**: cantidad y suma por tipo idénticas al Libro.
4. **Resumen mensual** (`monthly_summary`) = Libro, mes por mes.
5. **Lo que lee la pantalla** (`getReportRows` paginado + `summarize` + `byCategory`) = Libro.

### Los escenarios

| Archivo | Qué simula |
|---|---|
| [`libro-ejemplo.test.ts`](../tests/contable/libro-ejemplo.test.ts) | Un mes con **resultados calculados a mano** escritos en el test (se pueden verificar con calculadora): sueldo, renta, gasto sin cuenta, tarjeta, pago de tarjeta, ahorro, aporte, rescate, valorización, presupuesto y métricas. |
| [`simulacion.test.ts`](../tests/contable/simulacion.test.ts) | **~2.5 años día a día** con dos personas: ~1,300 movimientos, montos escritos de 5 formas, transferencias, pagos de tarjeta, inversiones, 7 reglas recurrentes (día 30, día 31, semanal, anual, con fin), presupuestos, cambios de metas, ediciones, borrados, dobles clics, categoría renombrada y deshabilitada, cuenta cerrada. Cuadra **al cierre de cada mes** y verifica las métricas de cada mes cerrado (tasa de ahorro, metas, rachas, proyección, fondo de emergencia, comparación por categoría). |
| [`formularios.test.ts`](../tests/contable/formularios.test.ts) | Errores humanos: montos inválidos, céntimos (0.10 + 0.20), fechas inexistentes, sin categoría, transferencia a la misma cuenta, cuentas/categorías de otra persona, doble clic, categoría o cuenta deshabilitada, edición y borrado. Regla: **si el formulario da error, no se mueve ni un céntimo**. |
| [`recurrentes.test.ts`](../tests/contable/recurrentes.test.ts) | Calendario exacto por años: día 31 → fin de febrero (bisiesto incluido), 29 de febrero anual, 105 semanas, sin duplicados al procesar varias veces, editar una regla no cambia lo creado, pausa y reanudación. |
| [`categorias-predefinidas.test.ts`](../tests/contable/categorias-predefinidas.test.ts) | Los scripts para eliminar categorías predefinidas: solo borran las creadas en bloque por la app y sin uso; conservan las tuyas y las que tienen historial; el dinero no cambia; repetirlo no borra más; usuarios nuevos ya no las reciben. |
| [`auditoria.test.ts`](../tests/contable/auditoria.test.ts) | **Prueba a las pruebas**: sabotea la base a propósito (vista de saldos sin transferencias, resumen que cuenta transferencias como gasto, recurrente duplicado, categoría equivocada, presupuesto > 100 %, movimiento borrado por fuera) y exige que la auditoría y las invariantes lo detecten. |

La simulación es reproducible (semilla fija). Para probar otros datos:

```bash
SEMILLA=777 npm run test:contable
```

Si una prueba falla, el mensaje dice qué no cuadró y en qué mes (`[Ana 2025-07 …] saldo de la cuenta …`).

### Qué NO cubre (y cómo cubrirlo)

- **El Supabase real** (PostgREST, Auth, red): se cubre con la auditoría sobre tus datos.
- **Clics en la interfaz**: `npm run test:ui` (Playwright) revisa pantallas con datos de ejemplo.
- **Fechas futuras reales**: la base usa el reloj real, así que los recurrentes se prueban
  generando todo el historial pasado hasta hoy, no "viajando" al futuro.

## 2. Auditoría de tus datos reales

1. Abre el **SQL Editor** de Supabase.
2. Pega el contenido de [`scripts/auditoria.sql`](../scripts/auditoria.sql) y ejecútalo. **Solo lee**.
3. Cada fila debe decir **OK**. Si alguna dice **REVISAR**, el detalle indica cuántos casos hay.
   **INFO** es informativo (por ejemplo, movimientos programados a futuro).

## 3. La prueba definitiva: conciliar con el banco (5 minutos al mes)

Ninguna prueba sabe si olvidaste registrar un gasto. Una vez al mes:

1. Abre **Cuentas** en la app y el saldo real de cada banco, billetera y tarjeta.
2. Si coinciden, todo está bien. Si no, la diferencia es un movimiento que falta o sobra:
   búscalo en **Movimientos** filtrando por esa cuenta.
3. Ejecuta la auditoría.

## Hallazgos de estas pruebas

- **Reanudar un recurrente pausado genera las fechas que vencieron durante la pausa.**
  Si pausas el sueldo en marzo y lo reanudas en junio, se crean marzo, abril y mayo.
  Es el comportamiento actual (documentado en `recurrentes.test.ts`). Si prefieres que la pausa
  *salte* esas fechas, es un cambio de producto pendiente de decidir.
