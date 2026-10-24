# Diseño del sistema — Finanzas personales

## Contexto y restricciones

- Uso personal: máximo 2 usuarios, baja transaccionalidad.
- Accesible desde cualquier dispositivo (PWA).
- Moneda: soles (PEN). Zona horaria: `America/Lima` (UTC-5).
- Sin registro por invitación: la URL solo la conoce el dueño.
- Sin categorías por defecto: el usuario crea las suyas.

## Arquitectura

```
[Celular / PC]  PWA instalable
      │ HTTPS
[Next.js 16 en Vercel]  UI + Server Actions
      │   └─ proxy.ts: refresca la sesión de Supabase y protege rutas
[Supabase]  Postgres + Auth (email/contraseña) + RLS
```

Monolito: con 2 usuarios no hacen falta colas, caché ni microservicios.

## Modelo de datos

| Tabla | Propósito |
|---|---|
| `profiles` | 1:1 con `auth.users`. Moneda, zona horaria, cuenta por defecto. Se crea por trigger al registrarse. |
| `accounts` | Billeteras: `cash`, `debit`, `credit`, `savings`. Saldo inicial. Se desactivan, no se borran. |
| `categories` | `kind`: `expense`, `income`, `investment`. Se renombran y desactivan, no se borran. |
| `transactions` | Todos los movimientos. `type`: `expense`, `income`, `transfer`, `invest`, `divest`. |
| `investments` | Posiciones de inversión (ej. "Fondo BCP"), con categoría de tipo `investment`. |
| `investment_valuations` | Cuánto vale una inversión en una fecha (para rentabilidad). |
| `recurring_rules` | Sueldo, renta, suscripciones. Generan `transactions`. |
| `budgets` | Monto fijo por categoría y por mes. Cada mes puede variar. |
| `savings_goals` / `goal_contributions` | Metas como sobres virtuales con aportes manuales. |

Vistas (todas `security_invoker`, respetan RLS):

| Vista | Uso |
|---|---|
| `account_balances` | Saldo por cuenta (calculado, nunca guardado). |
| `categorized_movements` | Movimientos con su categoría efectiva, sin transferencias. Base de los dashboards. |
| `monthly_summary` | Ingreso, gasto, invertido y rescatado por mes. |
| `budget_progress` | Presupuesto vs. ejecutado por categoría y mes. |
| `goal_progress` | Ahorrado vs. meta. |

Función `suggest_descriptions(query)`: autocompletado del formulario con la última categoría, cuenta y monto usados.

## Decisiones y por qué

1. **Montos en céntimos (`bigint`)**. Los `float` acumulan errores de redondeo.
2. **Una sola tabla de movimientos**. Un `CHECK` (`is_valid_movement_shape`) garantiza la forma de cada tipo: una transferencia no tiene categoría, un gasto no tiene cuenta destino, etc.
3. **Saldo calculado**. Guardarlo obliga a sincronizarlo en cada alta, edición y borrado. Con este volumen, calcularlo es instantáneo.
4. **Transferencias ≠ gasto**. Pagar la tarjeta de crédito es una transferencia débito → crédito; el gasto se registró al comprar.
5. **Inversión = egreso del mes**. Un aporte (`invest`) saca dinero de una cuenta y cuenta en el resumen mensual y en el presupuesto, pero se reporta separado del gasto.
6. **Soft delete**. Categorías y cuentas usan `is_active`. Sin política `DELETE` en RLS, borrar es imposible. Deshabilitadas no aceptan movimientos nuevos, pero el historial y los dashboards las siguen mostrando.
7. **Cuenta por defecto en la base de datos**. Si un movimiento llega sin `account_id`, un trigger usa `profiles.default_account_id`.
8. **Fecha por defecto = hoy en Lima**. `user_today()` usa la zona horaria del perfil, no la del servidor (UTC).
9. **Aislamiento por usuario en tres capas**: RLS (`user_id = auth.uid()`), `user_id` con default `auth.uid()`, y FKs compuestas `(x_id, user_id)` que impiden referenciar filas de otro usuario.
10. **Cuenta por defecto protegida** (migración 2): la primera cuenta creada pasa a ser la de defecto, no se puede deshabilitar y solo una cuenta activa puede serlo.
11. **Recurrentes idempotentes**. Índice único `(recurring_rule_id, occurred_on)`: ejecutar el generador dos veces no duplica el sueldo.

## Plan por sprints

| Sprint | Entregable | Estado |
|---|---|---|
| 0 | Proyecto, esquema, RLS, pruebas del esquema | ✅ |
| 1 | Registro, login, logout con Supabase Auth | ✅ |
| 2 | Cuentas, categorías, cuenta por defecto | ✅ |
| 3 | Formulario de movimientos con autocompletado | |
| 4 | Dashboard: tarjetas, filtros, gráficos de líneas y de torta | |
| 5 | Recurrentes (generador + cron) y presupuestos | |
| 6 | Metas de ahorro, inversiones, PWA instalable | |
