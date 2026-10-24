# Roadmap

Estado al 2026-10-24. Cada sprint vive en su propia rama (ver [README](../README.md#ramas)).

## Hecho

| Sprint | Rama | Entregable |
|---|---|---|
| 0 | `sprint-0-schema` | Esquema completo (11 tablas, 5 vistas), reglas en triggers/CHECK, RLS, pruebas del esquema con PGlite |
| 1 | `sprint-1-auth` | Registro, login, logout, confirmación de email, protección de rutas (`proxy.ts`), `requireUser()` |
| 2 | `sprint-2-cuentas-categorias` | Cuentas (saldos, cuenta por defecto, deshabilitar), categorías por tipo (crear, renombrar, color, deshabilitar), navegación móvil |
| 3 | `sprint-3-movimientos` | Formulario de gasto/ingreso/transferencia con autocompletado; lista mensual con totales, edición y borrado |
| 4 | `sprint-4-dashboard` | Dashboard: filtros (período, categoría, cuenta), tarjetas con comparación, línea de egresos y dona por categoría; paleta accesible |

### Requisitos originales: cumplimiento

| Requisito | Estado |
|---|---|
| Ver gasto total y resúmenes en tarjetas por período (mes, fecha) | ✅ Dashboard |
| Ver gasto total y por categorías | ✅ Dashboard (dona + tabla) |
| Gráfico de líneas por día/mes y por categoría | ✅ Dashboard |
| Gráfico de torta con porcentajes | ✅ Dona + tabla con % |
| Categorías principales y categorías propias | ✅ (por decisión del usuario, sin categorías por defecto) |
| Login para que cada uno vea solo lo suyo | ✅ Supabase Auth + RLS |
| Registrar gasto con formulario simple; fecha opcional = hoy | ✅ |
| Categorías: no se borran, se deshabilitan; renombrar | ✅ |
| Historial y dashboards incluyen categorías deshabilitadas | ✅ |
| Cuentas: efectivo, débito, crédito, ahorro; cuenta por defecto; saldo por cuenta y total | ✅ |
| Cuenta opcional en el formulario → cuenta por defecto | ✅ (lo resuelve la base de datos) |
| Transferir entre cuentas sin que cuente como gasto | ✅ |
| Registrar ingresos | ✅ |
| Autocompletado con gastos frecuentes | ✅ |
| Crear cuenta en la web | ✅ |
| Pestaña de presupuesto por categoría y mes con avance | ⏳ Sprint 5 (esquema y vista listos) |
| Movimientos recurrentes (sueldo, renta, suscripciones) | ⏳ Sprint 5 (esquema listo) |
| Pestaña de inversiones con categorías y gráficos | ⏳ Sprint 6 (esquema listo) |
| Metas de ahorro con barra de progreso | ⏳ Sprint 6 (esquema y vista listos) |
| Fácil de usar desde cualquier dispositivo | 🟡 Responsive listo; falta PWA instalable y deploy |
| Sesión de 1 día | 🔄 Reemplazado por decisión del usuario: la sesión la maneja Supabase (ver deuda técnica) |

## Próximos sprints

### Sprint 5: recurrentes y presupuestos
- **Presupuestos** (`/presupuesto`): elegir mes, asignar monto por categoría de gasto o inversión, botón "copiar del mes anterior".
  - Barra de avance por categoría (`budget_progress`): verde < 80%, ámbar 80–100%, rojo > 100%, siempre con ícono + texto y nunca solo color.
  - Total presupuestado vs. **ingreso real del mes** (decisión del usuario), en tarjeta y gráfico.
- **Recurrentes** (desde Movimientos): crear, pausar y editar reglas.
  - Función SQL `generate_recurring_transactions(hasta date)` que crea los movimientos pendientes y avanza `next_run_on`. Es idempotente gracias al índice único.
  - Cuidar el día 31: calcular cada fecha desde `start_on + n meses`, no sumando un mes a la anterior.
  - Disparador: Vercel Cron diario → route handler protegido con un secreto (`CRON_SECRET`) que usa la *secret key* de Supabase **solo en el servidor**. Esto también evita que Supabase pause el proyecto por inactividad.

### Sprint 6: inversiones, metas y PWA
- **Inversiones** (`/inversiones`): crear posiciones, registrar aportes (`invest`) y rescates (`divest`) desde una cuenta, registrar valorizaciones; gráfico de aportado vs. valor actual y rentabilidad por categoría. Así la tarjeta "Inversión" del dashboard deja de estar siempre en S/ 0.
- **Metas de ahorro**: crear meta (monto, fecha), aportar/retirar, barra de progreso (`goal_progress`) y "te faltan S/ X; necesitas S/ Y por mes".
- **PWA**: `app/manifest.ts`, íconos, `theme_color`, instalable en Android/iOS. El `proxy.ts` ya excluye `manifest.webmanifest`.

## Operación y despliegue (pendiente)

| Tarea | Por qué |
|---|---|
| Unir las ramas en `master` (`git merge --ff-only sprint-4-dashboard`) | Hoy `master` solo tiene el esqueleto |
| Crear repositorio en GitHub y subirlo | No hay remoto; sin él no hay respaldo ni deploy |
| Deploy en Vercel + variables de entorno | La app solo corre en local |
| Supabase: *Site URL* y *Redirect URLs* de producción | Los enlaces de confirmación apuntarían a localhost |
| Supabase: desactivar *Allow new users to sign up* tras crear los 2 usuarios | El registro está abierto; cualquiera con la URL podría crear cuenta (sus datos quedarían aislados por RLS, pero ocuparía tu proyecto) |
| Evitar la pausa del plan gratis de Supabase (7 días sin uso) | Se resuelve con el cron del Sprint 5 |
| Respaldos: exportar la base periódicamente (`pg_dump` o el backup de Supabase) | El plan gratis no guarda respaldos descargables por mucho tiempo |

## Ideas a futuro (backlog)

Ordenadas por valor estimado para un usuario en Perú:

1. **Registro automático desde los correos del banco.** BCP, Interbank, BBVA y Scotiabank envían un correo por cada consumo. Una tarea programada leería esos correos (Gmail API, con permiso de solo lectura), extraería monto, comercio y fecha, y crearía el movimiento con la categoría sugerida. En Perú es más viable que el open banking, que casi no tiene cobertura local.
2. **Multi-moneda (USD).** En Perú es común tener cuentas y tarjetas en dólares. Requiere `currency` por cuenta y un tipo de cambio por fecha.
3. **Categorización automática** de descripciones nuevas con un LLM (Claude), aprendiendo de tus correcciones.
4. **Importar estados de cuenta** (CSV/Excel del banco) y **exportar** movimientos a CSV.
5. **Sincronización con brokers / apps de inversión** para registrar aportes y valorizaciones solos (requisito mencionado como "pronto").
6. **Gastos compartidos** entre los 2 usuarios (quién pagó, quién debe).
7. **Alertas**: presupuesto al 80%, suscripción por cobrar, saldo bajo.
8. **Reporte mensual** automático por correo.
9. **Foto del recibo** adjunta al movimiento (Supabase Storage).
10. **Búsqueda** en movimientos y **subcategorías** (`categories.parent_id` ya existe).
11. **Proyección de flujo de caja**: "a este ritmo, a fin de mes te quedan S/ X".
12. **Modo oscuro manual** y **ocultar montos** (para abrir la app en público).

## Deuda técnica y riesgos conocidos

| Prioridad | Tema | Detalle / propuesta |
|---|---|---|
| Alta | Sin páginas de error | No hay `error.tsx` ni `not-found.tsx`. Si falla una consulta, se ve la página de error genérica de Next (en inglés). Agregar `app/(app)/error.tsx` con mensaje y botón "Reintentar". |
| Alta | Verificación con datos reales | Los Sprints 2–4 se probaron con build, pruebas y datos de ejemplo, pero no con la sesión y los datos reales del usuario. |
| Media | Cliente de Supabase sin tipos | Las consultas devuelven `any` y se tipan a mano. Generar tipos con `npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts` y pasarlos a `createClient<Database>()`. |
| Media | Migraciones manuales | Se pegan en el SQL Editor. Adoptar la Supabase CLI (`supabase link` + `supabase db push`) para no olvidar ninguna. |
| Media | Sin pruebas end-to-end ni CI | Agregar Playwright (login → crear cuenta → registrar gasto → ver dashboard) y un GitHub Action con lint + test + test:db + build. |
| Media | Duración de sesión | El requisito original pedía sesión de 1 día; hoy Supabase mantiene la sesión mientras se use (refresh tokens). Si se quiere limitar: *Time-box user sessions* (plan Pro) o cerrar sesión al detectar `iat` mayor a 24 h en `proxy.ts`. |
| Baja | Zona horaria duplicada | La base usa `profiles.timezone`; el frontend usa la constante `TIME_ZONE` de `src/lib/dates.ts`. Coinciden mientras todo sea Lima. |
| Baja | Comodines en el autocompletado | En `suggest_descriptions`, un `%` o `_` escrito por el usuario actúa como comodín. Escaparlos. |
| Baja | Restos de la plantilla | `globals.css` fuerza `font-family: Arial` (pisa la fuente Geist) y `public/` tiene SVGs de ejemplo sin uso. |
| Baja | Dona | El tooltip puede tapar el total del centro; las categorías agrupadas en "Otras" muestran su color propio en la tabla. |
| Baja | Vista sin uso | `monthly_summary` no se usa (el dashboard calcula en TypeScript). Usarla o documentarla como API. |
| Baja | Feedback al filtrar | Al cambiar un filtro se mantiene el gráfico anterior hasta que llegan los datos, pero sin indicador visual (atenuar con `useLinkStatus` o el estado del formulario). |
