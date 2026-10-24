<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Finanzas: guía para agentes

App de finanzas personales para 1–2 usuarios en Perú (soles, hora de Lima).
Next.js 16 (App Router, Cache Components) + Supabase (Postgres, Auth, RLS) + Tailwind 4 + Recharts.
Toda la interfaz y los mensajes al usuario están en **español**.

Antes de cambiar algo, lee:

- [docs/DESIGN.md](docs/DESIGN.md): arquitectura y el porqué de cada decisión.
- [docs/DATABASE.md](docs/DATABASE.md): tablas, reglas, vistas y RLS.
- [docs/ROADMAP.md](docs/ROADMAP.md): qué está hecho, qué falta y la deuda conocida.

## Comandos

| Comando | Cuándo |
|---|---|
| `npm run dev` | Servidor local (puerto 3000). Necesita `.env.local` con las variables de Supabase. |
| `npm run lint` | Siempre antes de terminar. |
| `npm test` | Pruebas unitarias (`src/**/*.test.ts`, con `tsx --test`). |
| `npm run test:db` | Aplica **todas** las migraciones en un Postgres en memoria (PGlite) y prueba reglas, saldos y RLS. Obligatorio si tocas `supabase/`. |
| `npm run test:contable` | Pruebas contables ([docs/PRUEBAS_CONTABLES.md](docs/PRUEBAS_CONTABLES.md)): ejecuta las Server Actions reales contra PGlite y compara con un Libro independiente. Obligatorio si tocas dinero, movimientos, recurrentes, inversiones, presupuestos o métricas. Si agregas una Server Action o un filtro de supabase-js nuevo, extiende `tests/contable/fake-supabase.ts`. |
| `npm run build` | Valida el prerender de Cache Components. Sin Supabase real, usa variables falsas: `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=x npm run build` |

El log del servidor de desarrollo queda en `.next/dev/logs/next-development.log`.
Revísalo después de un cambio: los errores de prerender aparecen ahí y no en la terminal.

## Estructura

```
src/
  proxy.ts                    Refresca la sesión y protege rutas (antes "middleware")
  app/
    (auth)/                   Login y registro + Server Actions de auth
    auth/confirm/route.ts     Destino del enlace de confirmación de email
    (app)/                    Pantallas privadas (layout con navegación)
      page.tsx                Dashboard
      _dashboard/             Filtros y gráficos del dashboard
      movimientos/            Lista mensual, nuevo, editar ([id]), autocompletado
      cuentas/  categorias/   CRUD con Server Actions
  components/                 UI compartida (form-field.tsx, ui.tsx)
  lib/
    supabase/                 Clientes: server.ts, client.ts (navegador), proxy.ts
    auth.ts                   requireUser()
    money.ts dates.ts         Céntimos <-> soles; fechas en hora de Lima
    dashboard.ts              Cálculos puros del dashboard (+ dashboard.test.ts)
    metrics.ts                Métricas de avance: proyección, indicadores, comparaciones, rachas (+ metrics.test.ts)
    colors.ts                 Paleta de categorías validada para daltonismo
    action-state.ts           Tipo de respuesta de Server Actions + traducción de errores de BD
    data.ts types.ts          Consultas compartidas y tipos de dominio
supabase/
  migrations/                 SQL versionado; se ejecuta en orden por nombre
  tests/schema.test.mjs       Pruebas del esquema (PGlite + stub de auth)
```

## Reglas del proyecto (no negociables)

### Dinero y fechas
- **Montos siempre en céntimos (`bigint` / `number` entero).** Nunca `float` para dinero. Para convertir usa `parseToCents`, `formatCents` y `centsToInput` de `lib/money.ts`.
- **Las fechas de movimientos son días `YYYY-MM-DD` en hora de Lima.** Usa `todayISO()` y `currentMonth()` de `lib/dates.ts`, nunca `new Date().toISOString()` (eso es UTC y después de las 19:00 en Lima ya da "mañana").
- Para formatear un día, usa mediodía UTC (`T12:00:00Z`) como hace `lib/dates.ts`, así ninguna zona horaria cambia el día.

### Base de datos
- **Las migraciones solo se agregan, nunca se editan.** Para cambiar el esquema, crea `supabase/migrations/AAAAMMDDHHMMSS_descripcion.sql`. Las ya aplicadas viven en el Supabase del usuario.
- Las reglas de negocio van en la base (CHECK, triggers, RLS), no solo en la UI. La UI puede ocultar un botón; la base garantiza la regla.
- Toda tabla nueva lleva `user_id uuid not null default auth.uid()`, RLS activado con políticas `user_id = (select auth.uid())`, y FKs compuestas `(x_id, user_id)` hacia tablas del mismo usuario.
- Las vistas llevan `with (security_invoker = true)`; sin eso se saltan el RLS.
- Las funciones llevan `set search_path = ''` y nombres calificados (`public.tabla`).
- **No hay borrado** de cuentas, categorías, inversiones, reglas recurrentes ni metas: se desactivan con `is_active`. Solo se borran movimientos y registros de detalle.
- Cada regla nueva lleva su prueba en `supabase/tests/schema.test.mjs`.

### Next.js 16 / Cache Components
- `cacheComponents` y `partialPrefetching` están activos. Todo lo que lea cookies, `searchParams`, `params`, el reloj o Supabase va **dentro de `<Suspense>`**. Patrón: la página no es `async`; un componente hijo `async` dentro de `<Suspense>` recibe `searchParams`/`params` como promesa y los espera ahí.
- **`createClient()` del servidor llama a `connection()`**: Supabase usa `Date.now()` y no puede correr durante el prerender. No lo quites.
- **Llama a `requireUser()` antes de leer el reloj** (`todayISO()`, `currentMonth()`), porque es el que hace esperar a un request real.
- `usePathname()`/`useSearchParams()` en componentes cliente también requieren `<Suspense>` (ver `app/(app)/nav.tsx`).
- El archivo de middleware se llama `proxy.ts` (exporta `proxy`).
- Después de una mutación, usa `refresh()` de `next/cache`: los datos no están cacheados.

### Auth y seguridad
- En el servidor usa `requireUser()` (`lib/auth.ts`): valida el JWT con `getClaims()` y redirige a `/login`. No uses `getSession()` en el servidor.
- Toda Server Action que toca datos llama a `requireUser()`, aunque el proxy ya proteja la ruta.
- Nunca recibas `user_id` del cliente: la base lo pone con `default auth.uid()` y RLS lo valida.
- Solo la *publishable key* va en el código. Nada con prefijo `NEXT_PUBLIC_` puede ser secreto.
- Consultar Supabase desde el navegador está permitido (ver `description-combobox.tsx`) porque RLS limita las filas.

### Formularios (patrón establecido)
- Server Action con firma `(prev: ActionState, formData: FormData) => Promise<ActionState>` en un `actions.ts` con `"use server"`.
- Validación con **zod v4** (`z.email()`, `{ error: "..." }`, `z.flattenError`). Usa `fromZodError` y `fromDbError` de `lib/action-state.ts`.
- En error, devuelve `values: formValues(formData)`: React 19 resetea el formulario después de cada envío, y así el usuario no pierde lo que escribió (se repinta con `defaultValue={state.values?.campo}`).
- Para limpiar estado del cliente tras un éxito, envuelve la acción en `useActionState(async (prev, fd) => { const r = await accion(prev, fd); if (r.ok) setX(...); return r; }, {})`. **No uses `setState` dentro de `useEffect`** (el lint `react-hooks/set-state-in-effect` lo rechaza).
- Formularios con campos controlados (p. ej. el de movimientos) usan `onSubmit` + `startTransition(() => formAction(fd))` en vez de `<form action>`, para que React no los resetee solo.

### Gráficos y color
- Si la skill `dataviz` está disponible, léela antes de cambiar gráficos. En esta instalación no se encontró; las reglas de esta sección y la revisión en navegador siguen siendo obligatorias.
- Los colores de categorías salen de `CATEGORY_PALETTE` (`lib/colors.ts`), validada para daltonismo. No agregues colores sin validarlos.
- Máximo 8 colores por gráfico: el resto se agrupa en "Otras" (`topWithOther`). Resuelve los colores **una sola vez** con `withDistinctColors` y reutilízalos en todos los gráficos de la pantalla.
- En modo oscuro usa `categoryColor(hex, dark)`. Todo gráfico va acompañado de una tabla o lista con los valores.
- Líneas rectas (`type="linear"`): las curvas suavizadas inventan valores negativos.

### Estilo de código
- TypeScript estricto; alias `@/` → `src/`.
- Comentarios en español, breves, que expliquen el **porqué**.
- Tailwind con clases utilitarias; mobile-first. Tema claro por defecto; `dark:` usa la clase del documento configurada en Perfil. Solo la opción Sistema sigue `prefers-color-scheme`. Los gráficos usan `useIsDark()` de `lib/theme.ts`.
- Componentes de servidor por defecto; `"use client"` solo cuando hay estado o eventos.

## Decisiones del usuario (no revertir sin preguntar)

- Registro abierto, sin invitaciones: solo el dueño conoce la URL.
- Auth estándar de Supabase con email; la sesión la maneja Supabase.
- Categorías típicas por defecto y categorías propias, editables y desactivables por usuario (migración 20261027000000).
- Presupuesto = **total previsto mensual definido por el usuario**, distribuido por porcentajes entre categorías de gastos e inversión. Comparar ejecución e ingreso real sin cambiar automáticamente la base al cobrar. Usa budget_plans y budget_allocations; los presupuestos fijos anteriores se conservan en budgets.
- Los aportes a inversiones **cuentan como egreso** del mes y contra el presupuesto, pero se muestran separados del gasto.
- Inversiones y Presupuestos son pestañas propias y obligatorias del primer MVP. Categorías de inversión simples, sin subcategorías.
- Solo soles; conservar email/contraseña y la sesión estándar actual de Supabase, sin imponer 24 horas.
- Filtros de informes con Desde/Hasta visibles y accesos rápidos; sin selector Período. Casillas Todas para limpiar cada selección.
- Limpiar filtros es un enlace condicional para cuentas/categorías/tipo/búsqueda: conserva siempre las fechas o el acceso rápido elegido. Arrastrar en el gráfico aplica un rango global y actualiza Desde/Hasta. Sin barra inferior Brush ni controles de zoom local: se muestra el rango completo.
- Los campos de fecha/mes usan DateInput para abrir el calendario al pulsar cualquier parte del campo. Campos obligatorios con RequiredMark y semántica required; opcionales sin asterisco ni etiquetas de autorrelleno. El acceso rápido global a movimientos solo muestra el icono +, conservando su nombre accesible.
- Presupuestos cambia de mes al elegirlo, mediante navegación de cliente y sin botón Ver mes.
- Altas y transferencias mediante FormModal; cerrar tras éxito. Perfil tiene la preferencia de tema claro/oscuro/sistema por usuario.
- Metas de ahorro fuera de este MVP; documentadas para el MVP siguiente. El alcance y los criterios vigentes están en [docs/PLAN_MEJORA.md](docs/PLAN_MEJORA.md).
- Renombrar una categoría también cambia el nombre en el historial.

## Antes de terminar una tarea

1. `npm run lint`, `npm test`, `npm run test:contable` y, si tocaste SQL, `npm run test:db`.
2. `npm run build` con las variables falsas: detecta errores de Suspense y prerender que el lint no ve.
3. Si el cambio se ve en pantalla, revísalo en el navegador. Las pantallas privadas requieren sesión: para revisar gráficos sin sesión, crea una página temporal bajo `/auth/...` (ruta pública) con datos de ejemplo y bórrala al terminar.
4. Si agregaste una migración, avisa al usuario que debe ejecutarla en el SQL Editor de Supabase.
5. Actualiza [docs/ROADMAP.md](docs/ROADMAP.md) (y DESIGN/DATABASE si cambió una decisión o el esquema).
