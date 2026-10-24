# Finanzas

App web de finanzas personales para usar desde el celular o la PC. Registras gastos, ingresos y
transferencias entre tus cuentas, y ves en qué se va tu dinero con un dashboard filtrable.
Pensada para 1–2 personas en Perú: montos en soles (S/) y fechas en hora de Lima.

**Stack:** Next.js 16 · React 19 · Supabase (Postgres + Auth) · Tailwind CSS 4 · Recharts · zod

| Documento | Para qué |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | Arquitectura y por qué se diseñó así |
| [docs/DATABASE.md](docs/DATABASE.md) | Referencia del esquema: tablas, reglas, vistas, RLS |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Qué está hecho, qué falta, deuda técnica |
| [AGENTS.md](AGENTS.md) | Convenciones para quien escriba código (personas o agentes de IA) |

## Qué puedes hacer hoy

| Pantalla | Funciones |
|---|---|
| **Resumen** (`/`) | Tarjetas de ingresos, gastos, inversión y balance, comparadas con el período anterior. Gráfico de egresos por día o por mes (total o por categoría) y dona por categoría con tabla. Filtros por mes, últimos 3/6 meses, año, rango de fechas, categoría y cuenta. |
| **Movimientos** (`/movimientos`) | Lista mensual agrupada por día, con totales. Registrar gasto, ingreso o transferencia con autocompletado; la cuenta y la fecha son opcionales. Editar y borrar. Botón flotante **+** en el celular. |
| **Cuentas** (`/cuentas`) | Efectivo, débito, tarjeta de crédito y ahorro. Saldo por cuenta, saldo total, disponible y deuda en tarjetas. Cuenta por defecto. Deshabilitar sin perder el historial. |
| **Categorías** (`/categorias`) | Gastos, ingresos e inversiones. Crear, renombrar, cambiar color, deshabilitar. No se borran. |
| **Acceso** | Registro e inicio de sesión con email y contraseña, confirmación por correo, cierre de sesión. |

Lo que falta (presupuestos, recurrentes, metas de ahorro, inversiones, PWA, deploy) está en
[docs/ROADMAP.md](docs/ROADMAP.md).

### Cómo se usa (conceptos clave)

- **Pagar la tarjeta de crédito es una transferencia**, no un gasto. El gasto ya se registró cuando compraste con la tarjeta; si lo registraras de nuevo al pagar, contarías el gasto dos veces.
- **Si no eliges cuenta**, el movimiento va a tu cuenta por defecto. **Si no pones fecha**, se usa hoy.
- **Una categoría deshabilitada** desaparece del formulario, pero sigue en el historial y en los gráficos.
- **El saldo de cada cuenta se calcula**: saldo inicial + ingresos − gastos ± transferencias − aportes a inversiones.

## Puesta en marcha (local)

Requisitos: Node.js 22+ y una cuenta gratis en [supabase.com](https://supabase.com).

1. **Crea el proyecto en Supabase** (región sugerida: São Paulo, la más cercana a Lima).
2. **Crea la base de datos**: en **SQL Editor**, ejecuta **en orden** cada archivo de
   [`supabase/migrations/`](supabase/migrations) (el nombre empieza con la fecha). Cuando llegue
   una migración nueva, ejecuta solo esa.

   | Migración | Qué hace |
   |---|---|
   | `20261024000000_initial_schema.sql` | Esquema completo, reglas, RLS, vistas |
   | `20261025000000_default_account_rules.sql` | Reglas de la cuenta por defecto |
   | `20261026000000_category_palette.sql` | Cambia colores de categorías a la paleta accesible |

3. **Variables de entorno**: copia `.env.example` a `.env.local` y completa los valores con lo que
   está en **Project Settings → API Keys**.

   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<tu-proyecto>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | La *publishable key* (`sb_publishable_...`) |

   No hace falta la contraseña de la base de datos ni la *secret key*. Ninguna variable
   `NEXT_PUBLIC_` puede ser secreta: llega al navegador.
4. **Configura Auth** en Supabase:
   - **Authentication → URL Configuration**: en *Site URL* pon `http://localhost:3000` (después,
     la URL de Vercel) y agrega `http://localhost:3000/**` en *Redirect URLs*.
   - **Authentication → Emails → Confirm signup**: cambia el enlace por
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. Así funciona aunque
     abras el correo en otro dispositivo.
   - *Opcional*: en **Sign In / Providers → Email**, desactiva *Confirm email* para entrar sin confirmar.
5. **Levanta la app**:

   ```bash
   npm install
   npm run dev
   ```

   Abre http://localhost:3000, crea tu cuenta y luego crea tus cuentas y categorías.
   Para probarla desde el celular en la misma red Wi-Fi, usa la dirección *Network* que muestra
   `npm run dev` (por ejemplo, `http://192.168.x.x:3000`).

## Despliegue en Vercel (pendiente)

1. Sube el repositorio a GitHub (hoy no tiene remoto) con la rama final unida a `master`.
2. En [vercel.com](https://vercel.com), importa el repositorio. Vercel detecta Next.js solo.
3. Agrega las dos variables de entorno de arriba en **Settings → Environment Variables**.
4. En Supabase, cambia la *Site URL* a la URL de Vercel y agrégala en *Redirect URLs* (`https://tu-app.vercel.app/**`).
5. Cuando ya hayas creado tus usuarios, desactiva **Allow new users to sign up** en Supabase
   (**Authentication → Sign In / Providers**). Así nadie más puede registrarse aunque encuentre la URL.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en http://localhost:3000 |
| `npm run build` / `npm start` | Build de producción y servidor de producción |
| `npm run lint` | ESLint |
| `npm test` | Pruebas unitarias de cálculos: dashboard, montos, colores |
| `npm run test:db` | Aplica las migraciones en un Postgres en memoria (PGlite) y prueba reglas, saldos y aislamiento entre usuarios |

## Estructura

```
src/
  proxy.ts               Refresca la sesión; sin sesión redirige a /login
  app/
    (auth)/              Login, registro y sus Server Actions
    auth/confirm/        Destino del enlace de confirmación de email
    (app)/               Pantallas privadas: dashboard, movimientos, cuentas, categorías
    (app)/_dashboard/    Filtros y gráficos del dashboard
  components/            UI compartida (campos de formulario, tarjetas, botones)
  lib/
    supabase/            Clientes de Supabase (servidor, navegador, proxy)
    auth.ts              requireUser(): verifica la sesión en el servidor
    money.ts             Céntimos <-> soles
    dates.ts             Fechas en hora de Lima
    dashboard.ts         Cálculos del dashboard (funciones puras, con pruebas)
    colors.ts            Paleta de categorías validada para daltonismo
supabase/
  migrations/            Esquema SQL versionado
  tests/                 Pruebas del esquema con PGlite
docs/                    Diseño, base de datos, roadmap
```

## Ramas

Cada sprint vive en su rama, y cada una parte de la anterior:
`sprint-0-schema` → `sprint-1-auth` → `sprint-2-cuentas-categorias` → `sprint-3-movimientos` → `sprint-4-dashboard`.
`master` solo tiene el esqueleto inicial. Para unir todo:

```bash
git checkout master
git merge --ff-only sprint-4-dashboard
```
