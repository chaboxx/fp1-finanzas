# Base de datos

Postgres en Supabase. La fuente de verdad son los archivos de
[`supabase/migrations/`](../supabase/migrations); este documento los resume.
Las pruebas de todo lo que se describe aquí están en
[`supabase/tests/schema.test.mjs`](../supabase/tests/schema.test.mjs) (`npm run test:db`).

## Convenciones

| Convención | Detalle |
|---|---|
| Montos | `bigint` en **céntimos** (`*_cents`). S/ 15.50 = `1550`; US$ 15.50 también = `1550`: la moneda la da la cuenta (o la inversión). |
| Fechas de negocio | `date` (sin hora). "Hoy" lo calcula `user_today()` en la zona del usuario. |
| Fechas técnicas | `timestamptz` (`created_at`, `updated_at`). |
| Dueño | Cada tabla tiene `user_id uuid not null default auth.uid()`: el cliente nunca lo envía. |
| Integridad entre tablas | FKs compuestas `(x_id, user_id) → x(id, user_id)`: imposible referenciar filas de otro usuario. Por eso cada tabla referenciada tiene `unique (id, user_id)`. |
| Borrado | Lógico (`is_active`) en catálogos. Físico solo en registros de detalle (ver RLS). |
| Funciones | `set search_path = ''` y nombres calificados (`public.x`), como recomienda Supabase. |

## Migraciones

| Archivo | Contenido |
|---|---|
| `20261024000000_initial_schema.sql` | Tipos, tablas, triggers de negocio, RLS, vistas, autocompletado |
| `20261025000000_default_account_rules.sql` | Primera cuenta = por defecto; la cuenta por defecto no se deshabilita y debe estar activa |
| `20261026000000_category_palette.sql` | Migración de datos: colores de categorías a la paleta accesible |
| `20261027000000_finance_mvp.sql` | Presupuestos porcentuales, operaciones atómicas de inversión, predeterminadas, generador recurrente y saldos ejecutados |
| `20261028000000_profile_theme.sql` | Tema por usuario y consolidación de reglas para instalaciones del MVP anterior |
| `20261030000000_sin_categorias_predefinidas.sql` | Al registrarse ya no se crean categorías predefinidas (se elimina `seed_categories_for_user`). Borrar las existentes: `scripts/categorias-predefinidas-*.sql` |
| `20261029000000_financial_targets.sql` | Metas financieras por mes (`financial_targets`) y `accounts.in_emergency_fund` para la pestaña Métricas |
| `20261031000000_moneda_usd.sql` | Dólares: `currency` en cuentas e inversiones, reglas para no mezclar monedas y vistas por moneda (ver [Dólares](#dólares-migración-20261031000000)) |

Las migraciones **nunca se editan** una vez aplicadas: los cambios van en una migración nueva.
Hoy se aplican a mano en el SQL Editor de Supabase (ver [ROADMAP](ROADMAP.md) para automatizarlo).

## Tipos (enums)

| Tipo | Valores |
|---|---|
| `account_type` | `cash`, `debit`, `credit`, `savings` |
| `category_kind` | `expense`, `income`, `investment` |
| `transaction_type` | `expense`, `income`, `transfer`, `invest` (aporte), `divest` (rescate) |
| `recurrence_frequency` | `weekly`, `monthly`, `yearly` |
| `currency_code` | `PEN`, `USD` |

## Tablas

### `profiles` (1:1 con `auth.users`)
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | = `auth.users.id`; se borra en cascada con el usuario |
| `display_name` | text | sin uso aún |
| `currency` | char(3) | default `PEN` (sin uso: la moneda es de cada cuenta) |
| `timezone` | text | default `America/Lima`; lo usa `user_today()` |
| `default_account_id` | uuid | FK compuesta a `accounts`; debe ser una cuenta activa |

Se crea sola con el trigger `on_auth_user_created` cuando alguien se registra.

### `accounts`
| Columna | Tipo | Notas |
|---|---|---|
| `name` | text | 1–60 caracteres; único por usuario sin distinguir mayúsculas |
| `type` | account_type | |
| `initial_balance_cents` | bigint | en tarjetas de crédito es **negativo** (deuda) |
| `is_active` | boolean | no se borra; deshabilitada no acepta movimientos nuevos |

### `categories`
| Columna | Tipo | Notas |
|---|---|---|
| `name` | text | 1–40; único por (usuario, `kind`) sin distinguir mayúsculas |
| `kind` | category_kind | |
| `color` | text | `#rrggbb`; la UI ofrece la paleta de `src/lib/colors.ts` |
| `icon` | text | sin uso aún |
| `parent_id` | uuid | reservado para subcategorías (sin uso) |
| `is_active` | boolean | no se borra |

### `transactions`: todos los movimientos
| Columna | Tipo | Notas |
|---|---|---|
| `type` | transaction_type | |
| `amount_cents` | bigint | siempre `> 0`; el signo lo da el tipo |
| `occurred_on` | date | default `user_today()` |
| `description` | text | ≤ 140; base del autocompletado |
| `notes` | text | sin uso en la UI |
| `account_id` | uuid | si llega `null`, el trigger pone la cuenta por defecto |
| `to_account_id` | uuid | solo en `transfer` |
| `category_id` | uuid | solo en `expense` / `income` |
| `investment_id` | uuid | solo en `invest` / `divest` |
| `recurring_rule_id` | uuid | si la generó una regla recurrente |

**Forma por tipo** (`CHECK is_valid_movement_shape`):

| Tipo | `category_id` | `to_account_id` | `investment_id` |
|---|---|---|---|
| `expense`, `income` | obligatorio (y del `kind` correcto, por trigger) | — | — |
| `transfer` | — | obligatorio y distinto de `account_id` | — |
| `invest`, `divest` | — (hereda la de la inversión) | — | obligatorio |

Índices: `(user_id, occurred_on desc)`, `(user_id, category_id, occurred_on)`, `(user_id, account_id)`,
`(user_id, lower(description))` y único parcial `(recurring_rule_id, occurred_on)` (idempotencia de recurrentes).

### `investments` y `investment_valuations`
- `investments`: una posición (ej. "Fondo Mutuo BCP"), con `category_id` de tipo `investment`, `platform` opcional e `is_active`. Su pantalla pertenece al primer MVP revisado, pero todavía no está implementada (ver [Plan de mejora](PLAN_MEJORA.md)).
- `investment_valuations`: cuánto vale una posición en una fecha (`value_cents >= 0`, único por (inversión, `valued_on`)). Junto con los aportes permite calcular la rentabilidad.

### `recurring_rules`
Plantilla de un movimiento repetido (sueldo, renta, suscripciones): mismos campos que un movimiento,
más `frequency`, `start_on`, `end_on`, `next_run_on` e `is_active`. `account_id` puede ser `null`
(se usa la cuenta por defecto al generar). Aún no hay generador ni UI (Sprint 5).

### `budgets`
Monto fijo por categoría y por mes. `month` es el día 1 del mes (CHECK). Único por (usuario,
categoría, mes). Solo categorías `expense` o `investment` (trigger).

### `savings_goals` y `goal_contributions`
Metas como "sobres virtuales": `target_cents`, `target_date` opcional. Los aportes (`amount_cents <> 0`,
negativo = retiro) **no mueven dinero entre cuentas**. Sin UI; fuera del MVP actual por decisión del usuario y documentadas para el siguiente en [Plan de mejora](PLAN_MEJORA.md).

## Reglas de negocio (triggers)

| Trigger | Tabla / momento | Regla |
|---|---|---|
| `transactions_before_write` | `transactions` antes de insert/update | Cuenta vacía → cuenta por defecto (o error si no hay). Categoría del `kind` correcto. No acepta categoría ni cuenta **deshabilitadas** en movimientos nuevos o al cambiarlas (editar el monto de uno viejo sí se puede). Actualiza `updated_at`. |
| `investments_before_write` | `investments` | La categoría debe ser `investment`. |
| `budgets_before_write` | `budgets` | La categoría debe ser `expense` o `investment`. |
| `recurring_rules_before_write` | `recurring_rules` | Categoría del `kind` correcto según el tipo. |
| `on_auth_user_created` | `auth.users` después de insert | Crea el `profile` (`security definer`). |
| `accounts_set_first_as_default` | `accounts` después de insert | La primera cuenta pasa a ser la cuenta por defecto. |
| `accounts_protect_default` | `accounts` antes de update de `is_active` | No se puede deshabilitar la cuenta por defecto. |
| `profiles_check_default_account` | `profiles` antes de update | La cuenta por defecto debe estar activa. |

Los errores de los triggers usan `errcode = 'check_violation'` y mensajes en español que la app
muestra tal cual (`fromDbError` en `src/lib/action-state.ts`).

## Seguridad (RLS)

Todas las tablas tienen RLS activado. Las políticas comparan `user_id = (select auth.uid())`
(`id` en `profiles`). El `(select …)` hace que Postgres evalúe `auth.uid()` una sola vez por consulta.

| Tabla | Leer | Crear | Editar | Borrar |
|---|---|---|---|---|
| `profiles` | ✅ | (trigger) | ✅ | ❌ |
| `accounts`, `categories`, `investments`, `recurring_rules`, `savings_goals` | ✅ | ✅ | ✅ | ❌ |
| `transactions`, `budgets`, `goal_contributions`, `investment_valuations` | ✅ | ✅ | ✅ | ✅ |

❌ = no hay política: el `DELETE` no falla, pero afecta 0 filas.

## Vistas (todas `security_invoker = true`)

| Vista | Columnas principales | Uso |
|---|---|---|
| `account_balances` | `account_id`, `name`, `type`, `is_active`, `balance_cents` | Saldo = inicial + ingresos + rescates − gastos − aportes ± transferencias. Pantalla de cuentas. |
| `categorized_movements` | movimiento + `month`, `category_id/name/kind/color/is_active`, `account_id` | Movimientos con su categoría efectiva (las inversiones heredan la de su posición). **Excluye transferencias.** Base del dashboard. |
| `monthly_summary` | `month`, `income_cents`, `expense_cents`, `invested_cents`, `divested_cents` | Totales por mes (sin uso en la UI aún). |
| `budget_progress` | `budget_cents`, `spent_cents`, `used_pct` | Presupuesto vs. ejecutado (gasto + aportes). Para el Sprint 5. |
| `goal_progress` | `saved_cents`, `progress_pct` | Avance de metas. Para el Sprint 6. |

## Funciones

| Función | Qué hace |
|---|---|
| `user_today()` | Fecha de hoy en la zona horaria del perfil (default Lima). |
| `is_valid_movement_shape(...)` | Regla de forma por tipo (usada en los CHECK de `transactions` y `recurring_rules`). |
| `assert_category_kind(id, kinds[])` | Lanza error si la categoría no es de los tipos dados. |
| `suggest_descriptions(p_query, p_limit)` | Autocompletado: descripciones del usuario que contienen el texto, con la última categoría, cuenta y monto, ordenadas por frecuencia. Se llama por RPC desde el navegador. |

## Cómo se prueba

`npm run test:db` levanta un Postgres en memoria con [PGlite](https://pglite.dev), simula lo mínimo de
Supabase (`auth.users`, `auth.uid()` a partir de `request.jwt.claim.sub`, rol `authenticated`), aplica
todas las migraciones en orden y ejecuta escenarios como dos usuarios distintos: reglas de forma,
saldos, presupuestos, categorías deshabilitadas, cuenta por defecto, idempotencia de recurrentes,
autocompletado y aislamiento entre usuarios.

Límite: no prueba PostgREST ni el Auth real de Supabase. Esas capas se validan usando la app.

## Ampliación del MVP (migración 20261027000000)

Esta sección actualiza el esquema inicial descrito arriba:

- categories.seed_key: clave estable y única por usuario. El registro crea categorías típicas editables. Repetir la inicialización conserva renombrados y desactivaciones. seed_categories_for_user es una función interna sin permiso público.
- transactions.request_id: único por usuario para evitar duplicados al reintentar envíos. account_id sigue siendo NOT NULL en filas guardadas; sus tipos de escritura permiten null porque el trigger lo completa.
- investments.initial_capital_cents, opened_on y request_id: capital previo conocido o desconocido, fecha de apertura y protección contra duplicación de la posición inicial.
- recurring_rules.occurrence_index y last_error: índice del calendario original y motivo recuperable del último error.
- budget_plans: cabecera con id, user_id, month (día 1), total_cents positivo y updated_at; única por usuario/mes.
- budget_allocations: dueño, plan_id, category_id y percentage_bps entre 1 y 10.000; única por plan/categoría. FKs compuestas y RLS por usuario.
- El trigger de asignaciones bloquea la cabecera para serializar modificaciones y rechaza una suma mayor de 10.000 puntos básicos. Solo admite categorías de gasto o inversión.
- budget_plan_progress calcula asignaciones truncando a céntimos y muestra ejecución real hasta hoy. El residuo queda sin asignar. Los presupuestos fijos y budget_progress anteriores se conservan íntegros.
- account_balances y monthly_summary ahora excluyen movimientos futuros del ejecutado.

Operaciones:

| Función | Regla |
|---|---|
| save_budget_plan(month, total, allocations) | Cabecera y distribución se guardan atómicamente; preserva categorías ya asignadas aunque se deshabiliten y no modifica ingresos ni presupuestos fijos previos. |
| save_investment_entry(...) | Aporte/rescate en transactions, valorización sin movimiento y apertura con capital previo opcional. Creación de posición y movimiento en una transacción; reintentos no duplican. |
| recurrence_date(start, frequency, index) | Cada fecha se calcula desde el inicio original, incluyendo días 29–31 y años bisiestos. |
| generate_recurring_transactions(until, user) | Solo el dueño o service_role puede generar; no registra futuro, bloquea reglas, respeta el índice único y guarda errores recuperables. service_role envía el dueño explícito de cada regla. |
| suggest_descriptions(query, limit, type) | Filtra por tipo antes del límite y escapa % y _ como caracteres literales. |

Las inversiones y sus categorías deshabilitadas no aceptan aportes nuevos. Los registros anteriores pueden editarse conservando sus referencias. La generación contra catálogos deshabilitados falla de forma recuperable; actualizar last_error no reactiva la regla ni elimina registros.

Tipos de cliente en src/lib/database.types.ts, generados con npm run types:db desde todas las migraciones. Las consultas de informes recuperan páginas hasta una respuesta vacía para no depender del límite configurado de PostgREST.

Activación remota y revisión de correspondencias históricas: [ACTIVAR_MVP.md](ACTIVAR_MVP.md).

## Perfil y tema

profiles.theme es texto NOT NULL con valor inicial light y CHECK para light, dark o system. Las políticas del perfil existentes permiten leer y editar únicamente el propio perfil. El formulario actualiza display_name y theme; no modifica el acceso ni las sesiones.

La migración 20261028000000 también consolida los procedimientos de presupuesto y recurrentes y las vistas ejecutadas para instalaciones que aplicaron una revisión previa del MVP. No altera movimientos ni recalcula los importes guardados. El generador usa el user_id explícito de la regla para funcionar también desde service_role sin una sesión personal.

## Métricas (migración 20261029000000)

### `financial_targets`
Metas que usa la pestaña **Métricas**. Una fila por mes en que el usuario cambió sus metas;
para evaluar un mes se usa la fila más reciente con `effective_month <=` ese mes, así cambiar
las metas hoy no reescribe cómo se evaluaron los meses anteriores. Sin filas, la app usa los
valores sugeridos (20 % de ahorro, sin meta de inversión, 6 meses de fondo).

| Columna | Tipo | Notas |
|---|---|---|
| `effective_month` | date | día 1 del mes desde el que valen; único por usuario |
| `savings_rate_bps` | integer | ahorro mínimo en puntos básicos (2000 = 20 %), 0–10000 |
| `monthly_investment_cents` | bigint | aporte neto mensual esperado; 0 = sin meta |
| `emergency_months` | integer | meses de gasto que debe cubrir el fondo, 1–24 |

RLS: leer, crear y editar lo propio; sin borrado.

### `accounts.in_emergency_fund`
`boolean`, default `true`. Indica si el saldo de la cuenta cuenta como dinero disponible para el
fondo de emergencia. Las tarjetas de crédito nunca cuentan, tengan el valor que tengan.

Los cálculos (proyección al cierre, tasa de ahorro, ritmo del presupuesto, cumplimiento de
inversión, fondo de emergencia, comparaciones por categoría y rachas) están en
`src/lib/metrics.ts` como funciones puras, con pruebas en `src/lib/metrics.test.ts`.

## Dólares (migración 20261031000000)

Decisión del usuario (plan en [PLAN_USD.md](PLAN_USD.md)): **la moneda es de la cuenta y nunca
se suman soles con dólares**. No hay tipo de cambio: las conversiones las hace la persona fuera de
la app y registra el resultado en la cuenta de esa moneda.

- `accounts.currency` e `investments.currency` (`currency_code`, default `PEN`). Todo lo anterior
  quedó en soles. Los movimientos no guardan moneda: usan la de su cuenta.
- La moneda de una cuenta o inversión **no cambia si ya tiene movimientos** (o valorizaciones /
  recurrentes): los montos guardados dejarían de significar lo que significaban.

| Trigger | Regla |
|---|---|
| `transactions_currency_check` | Transferencias solo entre cuentas de la misma moneda. Aportes y rescates solo desde cuentas de la moneda de la inversión. Un movimiento generado por un recurrente debe caer en una cuenta en soles (si la cuenta por defecto está en dólares, la regla guarda el error en `last_error`). Su nombre lo ordena después de `transactions_before_write`, que completa la cuenta por defecto. |
| `recurring_rules_currency_check` | Los recurrentes solo usan cuentas en soles. |
| `accounts_currency_lock` / `investments_currency_lock` | No cambiar la moneda con historial. |

Vistas (las columnas nuevas van al final):

| Vista | Cambio |
|---|---|
| `account_balances` | + `currency`: el saldo está en la moneda de la cuenta. |
| `categorized_movements` | + `currency` (la de la cuenta). |
| `monthly_summary` | Una fila por **mes y moneda** (+ `currency`). Métricas filtra `PEN`. |
| `budget_plan_progress`, `budget_progress` | Solo cuentan movimientos en soles: el presupuesto es en soles. |

`save_investment_entry` recibe `p_currency` (default `PEN`, al final para que las llamadas anteriores
sigan funcionando): moneda de la posición nueva; al buscar una posición por categoría y nombre,
también debe coincidir la moneda.

Cuentas que ya se usaban para dólares con los montos escritos en dólares:
`scripts/cuentas-a-dolares-1-vista-previa.sql` (solo lectura) y
`scripts/cuentas-a-dolares-2-convertir.sql` (marca la cuenta y sus inversiones como dólares sin
cambiar montos; se niega si mezclaría monedas).
