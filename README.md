# Finanzas

App personal de finanzas: gastos, ingresos, cuentas, presupuestos, metas de ahorro e inversiones.
Next.js 16 + Supabase. El diseño completo está en [docs/DESIGN.md](docs/DESIGN.md).

## Puesta en marcha

1. Crea un proyecto gratis en [supabase.com](https://supabase.com) (región sugerida: São Paulo, la más cercana a Lima).
2. En el proyecto, abre **SQL Editor**, pega el contenido de
   `supabase/migrations/20261024000000_initial_schema.sql` y ejecútalo.
3. Copia `.env.example` a `.env.local` y completa la URL y la *publishable key*
   (**Project Settings → API Keys**).
4. Configura Auth en Supabase:
   - **Authentication → URL Configuration**: *Site URL* = `http://localhost:3000`
     (luego la URL de Vercel) y agrega `http://localhost:3000/**` en *Redirect URLs*.
   - **Authentication → Emails → Confirm signup**: cambia el enlace por
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
     Así el enlace funciona aunque lo abras en otro dispositivo (el enlace por
     defecto solo funciona en el mismo navegador donde te registraste).
   - Opcional: en **Authentication → Sign In / Providers → Email** puedes
     desactivar *Confirm email* para entrar sin confirmar el correo.
5. Instala y levanta la app:

   ```bash
   npm install
   npm run dev
   ```

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en http://localhost:3000 |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |
| `npm run test:db` | Aplica las migraciones en un Postgres en memoria y prueba reglas, saldos y RLS |

## Estructura

```
src/
  app/
    (auth)/          Login, registro y sus Server Actions (login, signup, logout)
    auth/confirm/    Destino del enlace de confirmación de email
  components/        Componentes reutilizables (campos de formulario)
  lib/auth.ts        requireUser(): verifica la sesión en el servidor
  lib/supabase/      Clientes de Supabase (browser, server, proxy)
  proxy.ts           Refresca la sesión y redirige a /login si no hay usuario
supabase/
  migrations/        Esquema SQL versionado
  tests/             Pruebas del esquema con PGlite
docs/DESIGN.md       Decisiones de diseño
```
