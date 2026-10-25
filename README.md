# Finanzas

Finanzas personales en soles, para dos usuarios con datos separados. Next.js 16, React, Supabase/Postgres, Tailwind y Recharts. Fechas en hora de Lima.

[Abrir la aplicación](https://finanzas-app-eight-lyart.vercel.app) · [Repositorio](https://github.com/chaboxx/fp1-finanzas)

## Funciones

| Pantalla | Qué permite |
|---|---|
| Resumen | Período, mes, año y fechas; cuentas/categorías múltiples; gráficos por día, semana o mes; comparación, acumulado, selección de rango con Inicio/Fin, leyenda y detalle interactivos; alertas de presupuesto. |
| Movimientos | Gastos, ingresos y transferencias; autocompletado, búsqueda y filtros; edición y eliminación con confirmación; historial de inversiones enlazado a su propia pantalla. |
| Inversiones | Categorías simples y posiciones; aportes, rescates, valorizaciones y saldos iniciales; gráficos e historial. Un aporte descuenta una sola vez y consume presupuesto de inversión. |
| Presupuestos | Total previsto por mes, distribución por porcentajes, avance/exceso, dinero sin asignar y copia del mes anterior. El ingreso real no cambia la base prevista. |
| Cuentas | Efectivo, débito, crédito y ahorro; cuenta predeterminada; dinero, deuda y saldos a favor; transferencias e historial. |
| Categorías | Cada persona crea las suyas (sin predefinidas), personalizadas, nombre, color y desactivación/reactivación sin perder historial. |
| Recurrentes | Desde Movimientos: sueldo, renta, suscripciones y transferencias; calendario anclado, pausa, errores recuperables y generación sin duplicados. |
| Acceso | Registro, email/contraseña y sesión estándar de Supabase. |
| Perfil | Nombre y tema claro, oscuro o del sistema, con vista previa y preferencia por usuario. Claro por defecto. |

Metas de ahorro, brokers automáticos, USD, subcategorías y PWA quedan para otro MVP.

## Activar una instalación existente

Cada instalación debe tener las migraciones aplicadas en orden. Durante el despliegue se comprobó que la base actual ya tiene budget_plans, profiles.theme y financial_targets; no se modificaron sus datos.

Para actualizar otra instalación, sigue [ACTIVAR_MVP.md](docs/ACTIVAR_MVP.md): respaldo y reporte previo de solo lectura. Si solo tiene Inversiones/Presupuestos, aplica [20261028000000_profile_theme.sql](supabase/migrations/20261028000000_profile_theme.sql) y [20261029000000_financial_targets.sql](supabase/migrations/20261029000000_financial_targets.sql) (pestaña Métricas). Para una base anterior, aplica primero la migración 20261027000000. Si no quieres categorías predefinidas, sigue la sección 4 de ACTIVAR_MVP.md. Los movimientos y presupuestos fijos se conservan; no se reclasifican inversiones por el nombre.

## Instalar desde cero

1. Node.js 22+ y un proyecto de Supabase.
2. Ejecutar en orden todos los archivos de supabase/migrations en el SQL Editor.
3. Copiar .env.example a .env.local y completar la URL y publishable key de Supabase. Para uso local no necesitas las variables opcionales de servidor.
4. En Supabase Auth, configurar Site URL y las URL de redirección. Para confirmación por correo, usar el destino /auth/confirm con token_hash y type=email.
5. Ejecutar npm install y npm run dev; abrir http://localhost:3000.
6. Crear usuario y una cuenta con saldo inicial. La primera queda predeterminada y las categorías típicas se crean con el registro.

## Comandos

| Comando | Uso |
|---|---|
| npm run dev | Desarrollo local. |
| npm run lint | Revisión estática. |
| npm test | Cálculos, fechas, dinero, presupuestos, calendarios y paginación. |
| npm run test:db | Todas las migraciones y reglas financieras/RLS en Postgres en memoria. |
| npm run test:contable | Pruebas contables: formularios reales, ~2.5 años simulados, recurrentes, métricas y auditoría. Ver [PRUEBAS_CONTABLES.md](docs/PRUEBAS_CONTABLES.md). |
| npm run test:ui | Interacciones, capturas de escritorio/móvil y modo oscuro con datos ficticios; elimina la página temporal al terminar. |
| npm run build | Compilación de producción, incluyendo tipos y prerender. |
| npm run types:db | Regenerar tipos TypeScript a partir de las migraciones. |

Para test:ui, instalar el navegador una vez con npx playwright install chromium. El flujo de CI ejecuta estas comprobaciones con variables públicas falsas; no necesita credenciales de la cuenta real.

## Reglas del dinero

- Gasto y aporte descuentan saldo una sola vez; solo el aporte aparece como inversión.
- Rescate devuelve dinero y se muestra separado de ingresos ordinarios.
- Transferir o pagar una tarjeta no es un gasto adicional.
- Actualizar una valorización o incorporar un saldo inicial de inversión no descuenta dinero de una cuenta.
- Cuentas y reportes ejecutados excluyen movimientos futuros, que se identifican en el historial.
- Categorías y cuentas deshabilitadas conservan su historial. Los reportes pueden consultarlas.

## Documentación

- [Plan y criterios de aceptación](docs/PLAN_MEJORA.md)
- [Estado y pendientes de activación](docs/ROADMAP.md)
- [Activación y validación real](docs/ACTIVAR_MVP.md)
- [Arquitectura](docs/DESIGN.md)
- [Modelo de datos](docs/DATABASE.md)
- [Convenciones para agentes](AGENTS.md)
