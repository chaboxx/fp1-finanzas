# Base de datos

Postgres en Supabase. La fuente de verdad son los archivos de
[`supabase/migrations/`](../supabase/migrations); este documento los resume.
Las pruebas de todo lo que se describe aquí están en
[`supabase/tests/schema.test.mjs`](../supabase/tests/schema.test.mjs) (`npm run test:db`).

## Convenciones

| Convención | Detalle |
|---|---|
| Montos | `bigint` en **céntimos** (`*_cents`). S/ 15.50 = `1550`. |
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

Las migraciones **nunca se editan** una vez aplicadas: los cambios van en una migración nueva.
Hoy se aplican a mano en el SQL Editor de Supabase (ver [ROADMAP](ROADMAP.md) para automatizarlo).

## Tipos (enums)

| Tipo | Valores |
|---|---|
| `account_type` | `cash`, `debit`, `credit`, `savings` |
| `category_kind` | `expense`, `income`, `investment` |
| `transaction_type` | `expense`, `income`, `transfer`, `invest` (aporte), `divest` (rescate) |
| `recurrence_frequency` | `weekly`, `monthly`, `yearly` |

## Tablas

### `profiles` (1:1 con `auth.users`)
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | = `auth.users.id`; se borra en cascada con el usuario |
| `display_name` | text | sin uso aún |
| `currency` | char(3) | default `PEN` (sin uso en la UI: todo es soles) |
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
- `investments`: una posición (ej. "Fondo Mutuo BCP"), con `category_id` de tipo `investment`, `platform` opcional e `is_active`.
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
negativo = retiro) **no mueven dinero entre cuentas**. Sin UI aún (Sprint 6).

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
