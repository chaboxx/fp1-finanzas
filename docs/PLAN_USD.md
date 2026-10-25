# Plan: agregar dólares (USD)

Estado: **V1 implementada** (migración `20261031000000_moneda_usd.sql`). Reemplazó la decisión "Solo soles" de `AGENTS.md`.

## Idea central

**La moneda es de la cuenta, y cada moneda se informa por separado. Sin tipo de cambio.**

- Cada cuenta e inversión tiene moneda: `PEN` o `USD`. Un movimiento hereda la moneda de su cuenta.
- La app nunca convierte soles a dólares ni al revés. Las conversiones las hace el usuario fuera de la app
  (casa de cambio, banco, broker) y registra el resultado en la cuenta de la moneda correspondiente.
- Nunca se suman soles con dólares: cada total dice su moneda (`S/ 3,400.00 · US$ 1,200.00`).

### Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Moneda por movimiento: una cuenta en soles acepta un gasto de US$ 20 | La cuenta tendría saldo mixto ("S/ 500 + US$ 20") y el saldo deja de ser un número. |
| Tipo de cambio por movimiento para tener un único total en soles | Obliga a escribir el tipo de cambio en cada movimiento y a mantener una tabla de tipos de cambio. Es precisión que el usuario no necesita: complejidad sin beneficio. |

El selector de moneda del formulario **no** es "moneda por movimiento": solo filtra qué cuentas puedes elegir.
La moneda sigue guardada en la cuenta.

## Versiones

| | V1 (ahora) | Más adelante (si hace falta) |
|---|---|---|
| Cuentas en USD | Sí | |
| Gastos e ingresos en USD | Sí | |
| Transferencias | Solo entre cuentas de la misma moneda | Cambio de moneda (soles ↔ dólares) |
| Inversiones en USD | Sí | |
| Recurrentes | Solo en soles | No planificado |
| Presupuesto y metas | En soles | Metas en dólares |

---

## V1

### Reglas de producto

1. La moneda se elige al crear la cuenta y no cambia si la cuenta ya tiene movimientos.
2. **Gasto e ingreso:** el formulario tiene un selector **Soles / Dólares**. Según la moneda elegida, solo aparecen
   las cuentas de esa moneda. El monto se muestra con `S/` o `US$`.
   Si eliges dólares, la cuenta es obligatoria (la cuenta por defecto puede no estar en dólares).
3. **Transferencias:** el destino solo lista cuentas de la misma moneda que el origen.
4. **Inversiones:** cada posición tiene moneda. Aportes, rescates, valorizaciones y capital inicial van en esa moneda,
   y los aportes y rescates solo usan cuentas de esa moneda.
5. **Recurrentes:** solo en cuentas en soles.
6. **Informes:**
   - Cuentas: totales separados por moneda.
   - Resumen, Movimientos y Cuentas: selector **Soles / Dólares** (en la URL, `?moneda=USD`) que cambia la fila de tarjetas y el gráfico. La tarjeta **Aportes a inversiones** muestra siempre ambas monedas, porque los dólares suelen ir a inversiones. La lista de movimientos muestra todos, cada uno con su símbolo.
   - Inversiones: totales separados por moneda.
   - Presupuesto y Métricas: solo soles. Los gastos y aportes en dólares no cuentan en ellos.
7. La base garantiza las reglas 1, 3, 4 y 5; la UI solo las facilita.

### 1. Base de datos — una migración nueva

`supabase/migrations/2026XXXX_moneda_usd.sql`, solo agrega:

- Tipo `currency_code` (`'PEN'`, `'USD'`).
- `accounts.currency` e `investments.currency`, `not null default 'PEN'`. Todo lo existente queda en soles.
- Triggers:
  - Transferencia con cuentas de distinta moneda → rechazada.
  - Aporte/rescate con moneda de cuenta ≠ moneda de inversión → rechazado.
  - Recurrente en una cuenta USD → rechazado. Si un recurrente sin cuenta cae en una cuenta por defecto en USD,
    se anota el error en la regla (`last_error`) y no se genera.
  - `accounts.currency` e `investments.currency` no cambian si ya tienen movimientos o valorizaciones.
- Vistas (`create or replace`): `account_balances` y `categorized_movements` exponen `currency`;
  `monthly_summary` agrupa por moneda; `budget_plan_progress` cuenta solo movimientos en soles.
- Los movimientos no guardan moneda: la toman de su cuenta. Como la moneda de una cuenta con movimientos no puede
  cambiar, no hay forma de que se desincronicen.
- Pruebas en `supabase/tests/schema.test.mjs` para cada regla.

Orden de despliegue: primero la migración en Supabase, después el código. El código actual sigue funcionando con la
migración aplicada, porque todo queda en soles por defecto.

### 2. TypeScript

- `lib/money.ts`: `formatCents(cents, currency = "PEN")` (`US$ 1,200.00`); `parseToCents` también acepta `$` y `US$`.
- `lib/types.ts`: tipo `Currency` y `currency` en `Account`, `AccountWithBalance` y las filas de informes.
- `lib/finance-data.ts` (`getReportRows`): filtrar por moneda. `summarize`, `byCategory` y los gráficos no cambian:
  reciben filas de una sola moneda.
- Regenerar `database.types.ts`.

### 3. Pantallas

| Pantalla | Cambio |
|---|---|
| Cuentas | Moneda al crear (bloqueada si hay movimientos); saldo en su moneda; selector Soles/Dólares para los totales. |
| Nuevo/editar movimiento | Selector Soles / Dólares que filtra las cuentas; símbolo del monto según la moneda. |
| Transferencias | El destino solo lista cuentas de la moneda del origen. |
| Movimientos | Montos con su símbolo; selector Soles/Dólares para los totales; Aportes en ambas monedas. |
| Resumen | Selector Soles/Dólares para la fila de tarjetas y el gráfico; Aportes siempre en ambas monedas. |
| Inversiones | Moneda al crear la posición; montos con su símbolo; totales por moneda. |
| Recurrentes | Solo ofrece cuentas en soles. |
| Presupuesto, Métricas | Sin cambios visibles; siguen en soles. |

### 4. Pruebas y documentación

- `tests/contable`: el Libro anota la moneda de cada cuenta. Invariantes: saldo por cuenta en su moneda,
  conservación **por moneda**, informes por moneda. Escenarios: sueldo en USD, gasto con tarjeta en USD,
  inversión en USD, transferencia entre monedas rechazada, recurrente en USD rechazado, y presupuesto que no cuenta dólares.
- `scripts/auditoria.sql`: ninguna transferencia ni aporte mezcla monedas.
- Actualizar `CLAUDE.md`, `DESIGN.md`, `DATABASE.md`, `ROADMAP.md`.

### Tus cuentas actuales en dólares

Depende de cómo registraste los montos hasta hoy:

- **a) Escribiste los montos en dólares** (US$ 100 quedó como "S/ 100"): un script de una sola vez marca esas cuentas
  (y sus inversiones, si las hay) como USD. Los montos ya son correctos. Como efecto, esos movimientos dejan de sumarse
  en los informes en soles, donde hoy se cuentan mal.
- **b) Convertiste a soles al registrar:** se crea una cuenta USD nueva con su saldo real como saldo inicial
  y la antigua se desactiva. El historial queda como está.
- **c) Sin movimientos:** basta con cambiar la moneda.

### Complejidad V1: baja-media (4/10)

Una migración de ~80 líneas, ~15 archivos y ~6 escenarios contables. Sin tipo de cambio no hay montos derivados que
mantener: los cálculos actuales se reutilizan filtrando por moneda.

---

## Más adelante (solo si hace falta)

- **Cambio de moneda** (pasar soles a dólares dentro de la app). Hoy una transferencia es una fila con un solo monto;
  un cambio necesita dos (salen S/ 372, llegan US$ 100), cambia la vista de saldos y obliga a decidir qué hacer con la
  diferencia de cambio. Mientras no exista: registra un gasto en la cuenta en soles y un ingreso en la de dólares con una
  categoría "Cambio de moneda", o ajusta los saldos iniciales.
- **Metas en dólares:** por ejemplo, una meta de inversión mensual en USD en Métricas.
- **Recurrentes en dólares:** no planificado.
