# Estado del proyecto

Actualizado el 24 de octubre de 2026. Alcance funcional en [PLAN_MEJORA.md](PLAN_MEJORA.md); activación en [ACTIVAR_MVP.md](ACTIVAR_MVP.md).

## Implementado en código

| Área | Comportamiento |
|---|---|
| Navegación y diseño | Barra lateral en escritorio, navegación móvil con Más, contenido amplio, tipografía consistente, botones con área cómoda, estilos claros y oscuros. |
| Resumen | Períodos rápidos, mes/año elegibles, rango personalizado, cuentas y categorías múltiples, contexto global separado del análisis por categoría. |
| Gráficos | Día/Semana/Mes elegible, métrica, total/categorías, acumulado, comparación, guía y tooltip, rango completo sin barra inferior, leyenda interactiva, dona seleccionable y detalle por intervalo. |
| Consistencia | Resultado incluye rescates; transferencias no son gastos; futuros separados del ejecutado; consultas paginadas para no truncar el historial. |
| Cuentas | Totales separados de dinero, deuda y saldo a favor; creación en diálogo amplio, filtros de estado, transferencias y acceso al historial. |
| Inversiones | Pestaña propia, categorías simples, aportes y rescates atómicos, valorizaciones, posiciones iniciales sin descontar otra vez, edición y desactivación, gráficos e historial. |
| Métricas | Pestaña propia: 4 indicadores con meta y estado (ahorro, ritmo del presupuesto, cumplimiento de inversión, fondo de emergencia), proyección al cierre del mes sin extrapolar gastos fijos, comparaciones por categoría contra el promedio de 3 meses a la misma altura del mes, historial de 6 meses con rachas y metas editables vigentes desde un mes. |
| Presupuestos | Total mensual previsto + porcentajes; montos derivados, avance, exceso, sin asignación, copia del mes anterior, alertas en Resumen y comparación con ingreso real sin alterar la base. |
| Categorías | Sin predefinidas para usuarios nuevos (migración 20261030000000; las existentes se quitan con `scripts/categorias-predefinidas-*.sql`); crear propias, renombrar, color, desactivar/reactivar. Historial conservado. |
| Movimientos | Búsqueda por texto y tipo sin recargar el documento, conservando los demás filtros; enlaces desde gráficos y cuentas, identificación de aportes/rescates, edición y eliminación con confirmación y manejo de errores. |
| Recurrentes | Ingresos, gastos y transferencias; crear/editar, pausar/reactivar, generación de pendientes, calendario anclado, recuperación tras errores y ruta diaria protegida. |
| Acceso | Registro e inicio de sesión con email y contraseña. Cada campo de contraseña, incluida la confirmación del registro, tiene un botón de ojo para mostrarla u ocultarla de forma independiente; empieza oculta. La sesión estándar de Supabase no se cambia. |
| Calidad | Tipos de base generados desde las migraciones, errores en español, pruebas de dominio y SQL, revisión automatizada en navegador y flujo de CI. |
| Segunda revisión de UI | Desde/Hasta directos, accesos rápidos, casillas Todas, seleccionables de cuentas/categorías con cierre al tocar fuera o usar Escape, buscador sobre el historial, tarjetas con color semántico y altas/transferencias en diálogos. |
| Perfil | Ruta propia, nombre, claro por defecto y opciones oscuro/sistema; vista previa local y persistencia por usuario al aplicar la migración 20261028000000. |
| Exploración de fechas | Arrastrar un tramo del gráfico muestra Inicio/Fin en el recuadro y cambia el rango global, sus tarjetas y los campos Desde/Hasta. Las fechas manuales sustituyen accesos rápidos; limpiar selecciones conserva el período. |
| Navegación mensual | Presupuestos cambia de mes al seleccionarlo, sin botón adicional ni recarga del documento. Cuentas muestra iconos bancarios y los filtros usan flechas SVG coherentes. |
| Montos | Campos monetarios compartidos: solo dígitos, punto y hasta dos decimales; sin negativos ni separadores de miles. Al salir se muestran dos decimales. Validación idéntica en el servidor, conservando las reglas de cero según la operación. |
| Formularios y espacio | Calendarios al pulsar el campo completo; asteriscos en campos obligatorios, opcionales sin textos de autorrelleno, acceso rápido global solo con + y cuentas en tarjetas separadas. |
| Dólares | Cuentas e inversiones en soles o dólares; gastos, ingresos, aportes y transferencias en la moneda de la cuenta; Resumen (tarjetas y gráficos), Movimientos, Cuentas e Inversiones separados por moneda; Presupuesto y Métricas en soles. Sin tipo de cambio. Script para marcar como dólares cuentas antiguas. Plan y versiones en [PLAN_USD.md](PLAN_USD.md). |
| Producción | Actualizada el 25 de octubre de 2026 con la validación de montos; despliegue D4BSmeKYYaT65eEdh3TBsREJMTyg listo y comprobado. Publicada en [finanzas-app-eight-lyart.vercel.app](https://finanzas-app-eight-lyart.vercel.app), proyecto chaboxxs-projects/finanzas-app. Archivos de credenciales y pruebas excluidos de la publicación. |

## Activación pendiente fuera del repositorio

- **Dólares:** ejecutar la migración `20261031000000_moneda_usd.sql` en el SQL Editor de Supabase **antes** de publicar el código nuevo (el código anterior sigue funcionando con la migración aplicada). Después, para cuentas que ya usabas para dólares: sin movimientos, cámbialas en Cuentas → Editar → Moneda; con montos escritos en dólares, `scripts/cuentas-a-dolares-1-vista-previa.sql` y luego `-2-convertir.sql`; si los convertiste a soles al registrar, crea una cuenta nueva en dólares y deshabilita la antigua.

- En otras instalaciones, ejecutar la migración 20261029000000_financial_targets.sql si aún falta para activar Métricas (sin ella, la pestaña muestra un aviso en vez de fallar).
- Para quitar las categorías predefinidas: ejecutar `scripts/categorias-predefinidas-1-vista-previa.sql`, después `scripts/categorias-predefinidas-2-eliminar.sql`, y aplicar la migración 20261030000000_sin_categorias_predefinidas.sql para que no vuelvan a crearse al registrar usuarios.
- La comprobación de estructura de solo lectura del despliegue encontró budget_plans, profiles.theme y financial_targets disponibles. Para otras instalaciones, seguir las [instrucciones de migración](ACTIVAR_MVP.md).
- Comprobar las pantallas privadas con una sesión real en producción; la revisión remota sin sesión verificó acceso/registro, redirección de rutas privadas y ausencia de la página temporal de pruebas.
- Comprobar en Supabase la URL de producción y la redirección de confirmación por correo; esta sesión no tiene acceso administrativo a esa configuración.
- Revisar correspondencias de categorías históricas de inversión si existen. No se reclasifica por el nombre.
- Configurar secretos del programador diario si se requiere generación mientras la app está cerrada.
- Repositorio: [chaboxx/fp1-finanzas](https://github.com/chaboxx/fp1-finanzas), rama main. La publicación actual se hizo desde la carpeta local; conectar el repositorio en Vercel si se quieren despliegues automáticos por cada cambio.

## Verificación

Pruebas contables (`npm run test:contable`, detalle en [PRUEBAS_CONTABLES.md](PRUEBAS_CONTABLES.md)): 37 casos que ejecutan los formularios reales contra todas las migraciones, incluido un libro de ejemplo calculado a mano, ~2.5 años simulados con dos personas (cuadre al cierre de cada mes y métricas por mes), errores de formulario, calendario de recurrentes y una auditoría que detecta sabotajes. Para los datos reales: [scripts/auditoria.sql](../scripts/auditoria.sql), mensual.

Los comandos y los casos de aceptación están documentados en [ACTIVAR_MVP.md](ACTIVAR_MVP.md). La compilación original de estilos se resolvió al usar la integración PostCSS de Tailwind.

La revisión en navegador usa componentes reales con datos de ejemplo y no accede a la cuenta remota. Las reglas financieras y RLS se prueban en Postgres en memoria; esto no sustituye la comprobación posterior con la base real.

La verificación incluye cálculos y filtros puros, escenarios SQL y recorridos de navegador: selección de fechas por arrastre en ambos sentidos, limpieza sin perder el período, navegación mensual sin recarga, modales, temas y vistas móviles. La página pública temporal y el servidor de revisión se eliminan al terminar.

## MVP siguiente

- Metas de ahorro: usar el modelo existente, definir si son reservas virtuales o fondos vinculados a una cuenta, aportes/retiros y progreso.
- Sincronización de brokers con referencias externas para evitar duplicados.
- Dólares, más adelante y solo si hace falta: cambio de moneda dentro de la app (transferencias soles ↔ dólares) y metas en dólares. Recurrentes en dólares: no planificado.
- PWA, importación de estados y subcategorías.

## Deuda conocida

- Decidir si reanudar un recurrente pausado debe generar las fechas vencidas durante la pausa (comportamiento actual) o saltarlas.

- Migraciones todavía se activan manualmente; no hay credenciales de administración conectadas en este entorno.
- Las valorizaciones pueden corresponder a fechas diferentes: la interfaz muestra sus fechas y no presenta la suma como rentabilidad.
- La generación recupera hasta 400 vencimientos por regla y ejecución; se puede repetir para un historial mayor sin duplicar registros.
- La zona del frontend es Lima; la base conserva el campo de zona del perfil para una ampliación futura.
