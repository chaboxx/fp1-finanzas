# Activar el MVP actualizado

El código está preparado para Resumen, Cuentas, Inversiones, Presupuestos y recurrentes. El acceso y la duración de sesión de Supabase se conservan. Todo se registra en soles.

## 1. Preparar la base

1. Guarda un respaldo de la base de Supabase antes de cambiar el esquema.
2. Ejecuta [scripts/preflight.sql](../scripts/preflight.sql) en el SQL Editor y guarda sus resultados. Es solo lectura: muestra movimientos, saldos ejecutados, presupuestos fijos y categorías que podrían necesitar revisión.
3. Si ya aplicaste las tres migraciones iniciales, ejecuta [20261027000000_finance_mvp.sql](../supabase/migrations/20261027000000_finance_mvp.sql), luego [20261028000000_profile_theme.sql](../supabase/migrations/20261028000000_profile_theme.sql) y por último [20261029000000_financial_targets.sql](../supabase/migrations/20261029000000_financial_targets.sql) (metas de la pestaña Métricas). Si ya tienes Inversiones/Presupuestos activados, aplica solo las dos últimas. En una base nueva, aplica todas en orden.
4. Repite el reporte previo y comprueba que se conservan los movimientos y sus importes, los presupuestos fijos y los saldos ejecutados.
5. Reinicia la app si cambiaste variables de entorno y recarga el navegador.

La migración agrega categorías típicas por usuario. No modifica el nombre ni reactiva una categoría que ya tenga su clave de plantilla. Si encuentra una categoría del mismo tipo y nombre, la conserva. No transforma gastos antiguos en inversiones ni genera movimientos por esa transformación.

Los movimientos futuros permanecen guardados, pero ahora no alteran el saldo ejecutado de Cuentas. El reporte previo calcula ese mismo saldo para permitir una comparación coherente.

## 2. Revisar las categorías anteriores de inversión

Una categoría de gasto llamada Inversión no demuestra que todos sus registros sean aportes. El reporte identifica candidatos; hay que comprobar cada correspondencia con la categoría/posición correcta antes de reclasificar.

Cuando corresponda, la conversión debe modificar el mismo movimiento, usando tipo invest e investment_id, y quitar category_id. Nunca crear un segundo gasto. Comprobar saldos e importes antes y después. Esta conversión no se ejecuta automáticamente.

Los presupuestos fijos anteriores se conservan en budgets y aparecen en Presupuestos anteriores conservados. El nuevo plan por porcentajes se define explícitamente; no se inventan porcentajes de registros antiguos.

## 3. Recurrentes

En uso local, los vencimientos se procesan al abrir Resumen, Movimientos, Presupuestos o Cuentas. También hay un botón Procesar pendientes en Movimientos → Recurrentes.

Para generación diaria sin abrir la app, en Vercel configura estas variables privadas:

- SUPABASE_SECRET_KEY: clave de servidor de Supabase, nunca con prefijo NEXT_PUBLIC_.
- CRON_SECRET: un secreto aleatorio largo para autorizar el trabajo programado.

vercel.json llama /api/recurrentes todos los días a las 10:00 UTC, 05:00 en Lima. La ruta comprueba el secreto. Sin esta configuración, la generación al entrar a la app sigue funcionando. No se asume que una tarea programada garantice disponibilidad o evite la suspensión del proveedor.

Cada regla conserva el día original, admite pausa y fecha final y muestra el motivo si no se pudo generar. Al reactivar se recuperan vencimientos pendientes. Cambiar el calendario aplica desde mañana; editar importes no altera movimientos anteriores.

## 4. Comprobar antes de usar con datos reales

- Registrar gasto sin cuenta ni fecha: debe usar la cuenta predeterminada y hoy en Lima.
- Transferir entre cuentas y pagar tarjeta: no debe aumentar gastos ni consumir presupuesto.
- Registrar aporte, rescate y valorización: solo los dos primeros mueven dinero, una vez.
- Crear S/ 5.000 de presupuesto con Comida al 30 %. S/ 1.600 ejecutados deben mostrar S/ 100 de exceso y 106,7 % utilizado.
- Confirmar que cambiar los ingresos reales no altera el total previsto.
- Revisar categorías deshabilitadas en el historial y aislamiento entre ambos usuarios.

## 5. Verificación local reproducible

- npm run lint
- npm test
- npm run test:db
- npm run build
- npm run test:ui

test:ui crea una página temporal con datos ficticios, usa un servidor aislado y elimina esa página al terminar. No crea usuarios ni movimientos en Supabase. Revisa interacciones y toma capturas en test-results. Las operaciones y el aislamiento de datos se prueban por separado con todas las migraciones en Postgres en memoria.

La comprobación final con sesiones reales y la base remota debe realizarse después de aplicar la migración. El proyecto no incluye credenciales administrativas para aplicar cambios remotos desde este entorno.

Metas de ahorro, sincronización de brokers, dólares y PWA quedan para otro MVP.

## 6. Perfil y segunda revisión visual

La ruta /perfil permite editar el nombre y guardar Claro, Oscuro o Del sistema. Claro es el valor inicial. La elección se aplica inmediatamente como vista previa y se conserva localmente; guardar perfil la sincroniza con Supabase para ese usuario. Los gráficos usan el tema elegido, no únicamente la configuración del dispositivo.

La comprobación remota de estructura de solo lectura del 24 de octubre de 2026, antes del despliegue, encontró budget_plans, profiles.theme y financial_targets disponibles. No se ejecutaron migraciones remotas ni se modificaron datos durante el despliegue.

Resumen, Movimientos e Inversiones muestran directamente Desde/Hasta y accesos rápidos, sin selector de tipo de período. Cuentas y categorías tienen una casilla Todas para quitar su selección. Las altas y transferencias se abren en diálogos; las tarjetas distinguen ingresos, gastos, inversiones y resultado por color.

## 7. Producción en Vercel

- Aplicación: https://finanzas-app-eight-lyart.vercel.app
- Proyecto: chaboxxs-projects/finanzas-app.
- Despliegue verificado: https://vercel.com/chaboxxs-projects/finanzas-app/D4BSmeKYYaT65eEdh3TBsREJMTyg
- Se configuraron NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY para Production y Preview. No se publicaron archivos .env ni contraseñas locales.
- .vercelignore excluye las carpetas de pruebas, resultados, documentación y SQL de la raíz. Conserva src/lib/supabase, que sí necesita la aplicación.
- Comprobación remota: /login y /signup responden 200; / y /cuentas redirigen al acceso sin sesión; /auth/revision responde 404; formulario de acceso visible y sin errores del navegador.
- El recuadro de Inicio/Fin forma parte del gráfico compartido de Resumen y aportes de Inversiones. Conserva el orden cronológico al arrastrar en ambos sentidos.

La confirmación de nuevas cuentas por correo está activada en Supabase. No se pudo leer ni cambiar su lista de URLs permitidas desde esta sesión, que no tiene credenciales de administración. En [configuración de URLs de Auth](https://supabase.com/dashboard/project/ahjmfipsohrilwjxynye/auth/url-configuration), comprobar/incluir la aplicación como Site URL y https://finanzas-app-eight-lyart.vercel.app/auth/confirm como Redirect URL; conservar las entradas locales si aún se usan.

SUPABASE_SECRET_KEY y CRON_SECRET no están configuradas en producción: el trabajo diario con la app cerrada queda pendiente. La generación al entrar en la app o usar Procesar pendientes continúa disponible.

Para publicar cambios desde esta misma carpeta vinculada: npx vercel@65.2.0 deploy --prod. El repositorio es https://github.com/chaboxx/fp1-finanzas, rama main. Vercel todavía usa despliegues desde la carpeta local; para publicar automáticamente al hacer push, conectar este repositorio desde la configuración del proyecto en Vercel.

## 4. Quitar las categorías predefinidas (opcional)

La migración 20261027000000 creó 14 categorías típicas por usuario. Para quitarlas:

1. Respalda la base.
2. Ejecuta [scripts/categorias-predefinidas-1-vista-previa.sql](../scripts/categorias-predefinidas-1-vista-previa.sql). Solo lee: muestra cuáles se borrarán y cuáles se conservan y por qué.
3. Ejecuta [scripts/categorias-predefinidas-2-eliminar.sql](../scripts/categorias-predefinidas-2-eliminar.sql). Borra únicamente las que la app creó en bloque y que no se usan en movimientos, inversiones, recurrentes, presupuestos ni subcategorías. Las tuyas (aunque la migración las haya marcado) y las que tienen historial se conservan; si no quieres verlas, deshabilítalas desde Categorías. Los saldos no cambian.
4. Aplica [20261030000000_sin_categorias_predefinidas.sql](../supabase/migrations/20261030000000_sin_categorias_predefinidas.sql) para que no vuelvan a crearse al registrar usuarios nuevos.
5. Ejecuta [scripts/auditoria.sql](../scripts/auditoria.sql): todo debe seguir en OK.
