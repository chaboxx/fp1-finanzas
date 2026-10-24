# Plan de mejora del MVP de Finanzas

Fecha: 24 de octubre de 2026. Estado actualizado: implementado en código local; activación y comprobación con la base remota pendientes. Este documento conserva el plan y la auditoría inicial. El estado vigente está en [ROADMAP.md](ROADMAP.md) y la activación en [ACTIVAR_MVP.md](ACTIVAR_MVP.md).

## 1. Resultado esperado y decisiones confirmadas

Una app personal para registrar dinero con rapidez y analizarlo con claridad, desde escritorio y celular. El primer MVP incluye Resumen, Movimientos, Inversiones, Presupuestos, Cuentas y Categorías, además del acceso y registro existentes.

Decisiones confirmadas en esta conversación:

- Inversiones tiene su propia pestaña y categorías simples, como S&P 500, Cripto o Depósitos. No se implementa un árbol de subcategorías.
- Un aporte a una inversión descuenta saldo de la cuenta de origen y cuenta como egreso del período. Se identifica como inversión y se registra una sola vez.
- Presupuestos tiene su propia pestaña. El usuario define un total mensual, por ejemplo S/ 5.000, y reparte porcentajes entre sus categorías de gasto e inversión.
- El total mensual es una base prevista que define el usuario. Los ingresos reales sirven para comparar y alertar; no cambian automáticamente esa base.
- Se usa solo PEN y la zona horaria de Lima.
- Se conservan email, contraseña y la gestión de sesión actual de Supabase. No se exige un cierre a las 24 horas.
- Las metas de ahorro quedan fuera de este MVP y pasan al MVP siguiente.
- Se incluyen categorías típicas predeterminadas, además de categorías propias, según los requisitos actuales. Son editables y desactivables por usuario.

Se conserva Next.js, Supabase/Postgres, Tailwind y Recharts. La escala de dos usuarios no justifica introducir otro backend ni otra base de datos. Dos usuarios simultáneos es la carga esperada, no una instrucción para bloquear un tercer registro ni compartir información entre usuarios.

## 2. Qué encontré en el proyecto

La revisión cubre código, migraciones, documentación y pruebas locales. No se consultó la base remota ni se verificaron las pantallas con una sesión real. Por eso no se afirma qué categorías concretas existen en los datos del usuario ni que todos los fallos reportados estén reproducidos en navegador.

| Hallazgo comprobable | Consecuencia | Acción |
|---|---|---|
| La agrupación del gráfico se decide automáticamente: día hasta 62 días y mes en rangos mayores. | No puedes elegir Día/Mes independientemente del período. | Añadir selector explícito Día/Semana/Mes. |
| La serie sí rellena con cero los días sin movimientos; el eje usa separación mínima entre etiquetas. | Las etiquetas pueden saltar de 3 a 5 a 7 aunque los datos diarios existan. | Calendario continuo, tooltip con fecha exacta y zoom o desplazamiento para revisar cada día. |
| “Egresos por día” es un título; los únicos botones son Total/Por categoría. | Un texto parece un control y no responde como esperas. | Separar título, selectores y estados activos. |
| La leyenda de líneas y las porciones de la dona no tienen acciones. La tabla de categorías sí contiene enlaces de filtro. | Interacción desigual; no hay un contrato claro para cada clic. | Definir y comprobar cada acción, incluyendo los enlaces que ya existen. |
| La base tiene inversiones, valorizaciones y movimientos invest/divest. No existe la ruta de Inversiones. | La función está modelada pero no disponible como producto. | Construir su pestaña y conectarla al registro contable existente. |
| Las categorías son planas; parent_id está reservado y no se usa en la interfaz. | No hay jerarquía funcional que explique Inversión/S&P 500. | Usar Inversiones como sección y S&P 500 como categoría dentro de ella. |
| El formulario de Movimientos solo registra gasto, ingreso y transferencia. Categorías sí administra tipos de inversión. | Crear una categoría no permite registrar un aporte. | Administrar las categorías de inversión desde su propia pestaña. |
| El balance de Movimientos solo resta gastos; el Resumen también resta aportes y omite rescates. | Al activar inversiones, las pantallas podrían mostrar resultados distintos. | Unificar las definiciones y cálculos antes de conectar la nueva pestaña. |
| El componente SubmitButton tiene altura, pero carece de espacio horizontal y ancho propios. | “Crear cuenta” queda ajustado al texto. | Corregir el componente compartido y revisar todos sus usos. |
| Presupuestos, recurrentes y metas tienen tablas, pero no pantallas. | El esquema se confundió con una función terminada. | Presupuestos y recurrentes en este MVP; metas en el siguiente. |
| No hay creación de categorías predeterminadas. | No se cumple el catálogo inicial solicitado. | Añadir plantillas por usuario sin duplicar ni sobrescribir sus categorías. |
| Filtros, tarjetas y cálculos están repartidos entre páginas. | Hay riesgo de diferencias de criterio y contexto poco claro. | Compartir contratos de filtros, consultas y cálculos del dominio. |

Fuentes principales: [dashboard.ts](../src/lib/dashboard.ts), [Resumen](../src/app/(app)/page.tsx), [filtros](../src/app/(app)/_dashboard/filters.tsx), [gráficos](../src/app/(app)/_dashboard/charts.tsx), [Movimientos](../src/app/(app)/movimientos/page.tsx), [botones](../src/components/form-field.tsx), [esquema](../supabase/migrations/20261024000000_initial_schema.sql).

## 3. Modelo del dinero: una sola definición para toda la app

| Operación | Efecto en cuentas | Resumen y presupuesto |
|---|---|---|
| Ingreso | Suma a la cuenta elegida. | Ingreso real. |
| Gasto | Resta a la cuenta elegida o incrementa deuda si se paga con tarjeta. | Gasto y ejecución de su categoría. |
| Aporte a inversión | Resta una vez a la cuenta de origen. | Inversión, egreso y ejecución del presupuesto de inversión. |
| Rescate de inversión | Suma a la cuenta de destino. | Entrada por rescate, separada de sueldo u otros ingresos. |
| Transferencia entre cuentas | Resta en origen y suma en destino, en una sola operación. | No es gasto ni ingreso; no consume presupuesto. |
| Valorización de inversión | No cambia cuentas. | Actualiza el valor informado de la cartera; no es un aporte. |

Definiciones visibles:

- Gastos: consumos de categorías de gasto.
- Aportes a inversiones: dinero destinado a invertir durante el período.
- Egresos: gastos + aportes. No sumar otra vez una categoría genérica “Inversión”.
- Resultado del período: ingresos + rescates − gastos − aportes. Debe mostrar el desglose cuando haya rescates; no equivale al saldo actual de las cuentas.
- Saldo neto en cuentas: saldos iniciales más todos los movimientos con su signo. Las transferencias internas se compensan.
- Valor de inversiones: última valorización disponible de cada inversión, mostrando su fecha. Un aporte no demuestra por sí solo el valor de mercado actual.

Ejemplo verificable: con S/ 5.000 de ingreso, S/ 1.000 de gastos y S/ 500 de aporte, los egresos son S/ 1.500 y el resultado S/ 3.500. El aporte aparece en Inversiones y en el historial general como el mismo movimiento. Una transferencia posterior de S/ 200 entre cuentas no cambia esos totales.

## 4. Navegación y lenguaje visual

Escritorio: navegación lateral con Resumen, Movimientos, Inversiones, Presupuestos y Cuentas. Categorías y ajustes quedan accesibles como configuración. Celular: cuatro accesos principales y un menú Más para las demás secciones, sin comprimir siete pestañas en una barra.

Propuesta visual inicial: superficies neutras, texto con buen contraste y un acento azul; colores de categorías para identificar series, y estados acompañados de texto e iconos. Esta dirección visual es una propuesta, no una preferencia ya confirmada.

- Más espacio para analizar en escritorio: ampliar el contenido respecto al límite actual de 896 px.
- Tarjetas con una cifra principal, etiqueta inequívoca y comparación contextual.
- Botones principales con altura mínima de 44 px, espacio horizontal y estados de guardado, error y éxito. Ningún botón depende del largo de su texto para tener un área cómoda.
- Jerarquía consistente de títulos, etiquetas, campos y acciones; corregir la fuente global que actualmente fuerza Arial.
- Errores y vacíos en español, con recuperación clara. Al filtrar, indicar que los datos se están actualizando.
- Conservar modo claro y oscuro, teclado, foco visible y valores textuales alternativos a los gráficos.

La primera entrega visual debe enseñar Resumen, Cuentas, Inversiones y Presupuestos con datos de ejemplo identificados como tales. Así se puede revisar el diseño completo antes de extenderlo al resto de pantallas.

## 5. Resumen: filtros, exploración y estadísticas

### Filtros independientes

| Control | Opciones y comportamiento |
|---|---|
| Período | Hoy, últimos 7/30 días, mes elegido, últimos 3/6 meses, año elegido y rango personalizado. Anterior/Siguiente donde corresponda. |
| Agrupación | Día, Semana o Mes; elección manual aunque el rango sea largo. La opción inicial puede sugerirse según el rango. |
| Métrica | Gastos, aportes a inversiones, egresos o ingresos. El total y sus unidades siempre se identifican. |
| Series | Total o por categorías. Es una elección distinta de la agrupación temporal. |
| Cuentas | Todas o selección de cuentas; también pueden consultarse cuentas deshabilitadas con historial. |
| Categorías | Selección múltiple y restablecer. Solo categorías compatibles con la métrica. |
| Comparación | Período anterior equivalente o sin comparación. Fechas comparadas visibles. |

El período y las cuentas son el contexto global. La selección de categorías controla el análisis por categoría y el detalle; las tarjetas generales conservan el contexto global y lo indican. Junto a la selección se muestra su subtotal. Así filtrar Comida no convierte los ingresos en cero ni presenta un supuesto balance calculado solo con comida.

Los filtros y selecciones principales se guardan en la URL. Atrás/Adelante restaura controles y datos. Cambiar una opción no debe borrar otras ni dejar el selector mostrando un valor distinto al aplicado.

### Gráfico temporal

- Línea continua con todos los intervalos; un día sin movimiento vale cero. Los días futuros no se presentan como gasto ejecutado cero.
- Fecha completa, monto y categorías en el tooltip, con guía vertical para ubicar el día.
- Para un mes en escritorio, permitir leer cada día. En celular o rangos extensos, zoom/desplazamiento para revisar todos los puntos sin amontonar etiquetas.
- Rango seleccionable, restablecer vista y modos por intervalo/acumulado. El zoom indica si solo cambia la vista; no modifica silenciosamente las tarjetas.
- Comparación con línea diferenciada; limitar las series visibles y permitir ocultarlas. Más detalle mediante selección de categorías, sin superponer decenas de líneas.
- Semanas con inicio definido y meses anclados al calendario. Probar rangos que empiezan a mitad de mes para no omitir el último tramo parcial.
- Tabla desplegable con cada intervalo y su valor. El gráfico y la tabla deben sumar el mismo total.

### Qué hace cada clic

| Elemento | Acción |
|---|---|
| Día/Semana/Mes | Cambia la agrupación y marca la opción activa. |
| Total/Por categoría | Cambia las series manteniendo período y agrupación. |
| Nombre de categoría en leyenda | Muestra u oculta esa serie; el estado es visible. |
| Porción de dona o fila de categoría | Selecciona la categoría y muestra subtotal y detalle. |
| Punto de la serie | Abre los movimientos del intervalo y la categoría seleccionados. |
| Grupo Otras | Expande su composición para elegir una categoría concreta. |
| Quitar filtro/Restablecer | Recupera el contexto esperado sin perder otras selecciones. |

La dona permite elegir Gastos o Egresos. En Egresos puede mostrar Inversiones como un grupo y permitir entrar a S&P 500, Cripto, etc. Es una agrupación del informe, sin crear una categoría de gasto duplicada. Los porcentajes indican su denominador y suman 100 % sobre los registros filtrados.

Tarjetas: ingresos, gastos, aportes, egresos y resultado; comparación monetaria y porcentual cuando hay base. Añadir promedio diario de la métrica indicada, categoría principal y estado del presupuesto mensual. El promedio de gastos no puede incluir inversiones sin explicarlo.

Comparaciones: mes actual hasta hoy frente al mismo tramo anterior; meses cerrados frente a meses completos. Si el período anterior vale cero, mostrar Sin base de comparación. Los movimientos futuros o recurrentes previstos se separan de lo ejecutado en todas las métricas.

## 6. Inversiones como pestaña propia

- Encabezado con Registrar aporte, Registrar rescate y Actualizar valor.
- Categorías simples propias: S&P 500, Cripto, Depósitos y otras que cree el usuario. Editables y desactivables. No se requiere crear una categoría padre llamada Inversión.
- Por categoría, una inversión o posición puede tener nombre y plataforma opcionales para el usuario. La interfaz puede crear la posición necesaria al primer aporte sin exigir un segundo formulario técnico.
- Formulario de aporte: monto, categoría/inversión, descripción opcional, cuenta opcional que muestra la predeterminada y fecha opcional igual a hoy.
- Rescate: monto, inversión, cuenta que recibe el dinero y fecha. Se muestra separado de ingresos ordinarios y no repone automáticamente el presupuesto consumido por aportes.
- Valorizaciones manuales: importe total y fecha. Mostrar cuánto se aportó, cuánto se rescató y el valor informado, con sus fechas.
- Gráficos de aportes por día/mes, distribución por categoría y evolución del valor cuando haya valorizaciones.
- No llamar rentabilidad a la diferencia entre dos valorizaciones si hubo aportes. Con histórico completo, el resultado monetario se obtiene de valor actual + rescates − aportes. Si faltan capital inicial o datos, mostrar que el resultado no es calculable.
- Si se incorpora una inversión que ya existía antes de usar la app, distinguir el saldo inicial de un aporte nuevo para no volver a descontarlo de una cuenta. Registrar su base de capital cuando se quiera calcular el resultado.

El historial general puede listar aportes y rescates, con una marca y enlace a su pantalla de inversión. Su creación y edición pertenecen a Inversiones. No deben abrir una página de edición incompatible ni mostrarse como Transferencia por falta de descripción.

Automatización de brokers queda fuera de este MVP. Preparar a futuro un identificador de origen y referencia externa únicos por usuario para importar sin duplicar; no construir conectores todavía.

## 7. Presupuestos como pestaña propia y parte del Resumen

Flujo del usuario:

1. Elegir el mes y definir el total previsto, por ejemplo S/ 5.000.
2. Asignar porcentajes a categorías existentes de gastos e inversiones.
3. Ver en cada fila el porcentaje, monto asignado, monto ejecutado, disponible/exceso y barra de avance.
4. Ver cuánto queda sin asignar y copiar la distribución del mes anterior para ajustarla.

Ejemplo: Comida al 30 % de S/ 5.000 tiene S/ 1.500 asignados. Con S/ 1.200 ejecutados muestra 80 % utilizado y S/ 300 disponibles. Con S/ 1.600 muestra 106,7 % utilizado y un exceso de S/ 100. “30 % asignado” y “80 % utilizado” son indicadores distintos.

Reglas:

- La base prevista no cambia cuando se registra un sueldo. Mostrar también el ingreso real del mes y la diferencia respecto a lo previsto.
- La suma de porcentajes no puede superar el 100 % al guardar. Menos del 100 % es válido y muestra el importe pendiente de asignación.
- Definir redondeo a céntimos y mostrar cualquier diferencia residual. No usar números flotantes para dinero.
- Un gasto solo consume su categoría de gasto; un aporte solo consume su categoría de inversión. Las transferencias, rescates y valorizaciones no consumen ni restauran ese límite.
- Categorías con gastos pero sin asignación aparecen como Sin presupuesto; no desaparecen de la ejecución total.
- Categorías deshabilitadas con presupuesto o ejecución histórica siguen visibles en su mes.
- Al editar el total o un porcentaje, mostrar cómo cambia el límite del mes elegido. Copiar al siguiente mes no modifica meses anteriores.
- Alertas visibles en la app: cerca del límite desde 80 %, límite alcanzado al 100 % y exceso por encima. Mostrar importes y texto, además de color.
- El Resumen incluye total presupuestado frente a ejecutado, categorías en exceso y gasto+aportes frente a ingresos reales. Las alertas indican exactamente qué comparación las origina.

Cambios de datos propuestos: una cabecera mensual por usuario con el total previsto y asignaciones por categoría con porcentaje en puntos básicos. Adaptar budgets y budget_progress para calcular límites y ejecución con el mismo criterio. Conservar los presupuestos fijos que pudieran existir: no inventar sus porcentajes ni perderlos; preparar una conversión explícita durante la migración.

## 8. Cuentas, categorías y registro de movimientos

### Cuentas

- Resumen separado de dinero en cuentas, deuda de tarjetas y saldo neto; el patrimonio con inversiones solo se muestra si está definido y las valorizaciones tienen contexto.
- Calcular la deuda sumando deudas de cada tarjeta por separado. Un saldo a favor en otra tarjeta no debe ocultar parte de la deuda bajo la etiqueta Deuda.
- Tarjetas o filas legibles con nombre, tipo, saldo/deuda, marca de predeterminada y acceso al historial filtrado por esa cuenta.
- Nueva cuenta como acción principal amplia; formulario en panel o diálogo cómodo, incluyendo en celular.
- Transferir como acción visible, con origen, destino, monto y fecha; pagar tarjeta usa este mismo mecanismo.
- Menú secundario para editar, cambiar predeterminada o deshabilitar. Conservar la protección de la cuenta predeterminada.
- Las cuentas deshabilitadas no pierden su historial ni su saldo. La pantalla debe distinguir Todas/Activas/Deshabilitadas y explicar el alcance de sus totales.

### Categorías

- Gastos e ingresos en Categorías; inversiones administradas también dentro de su propia pestaña con el mismo catálogo subyacente.
- Catálogo inicial propuesto: Alimentación, Vivienda, Transporte, Servicios, Salud, Entretenimiento, Compras y Otros gastos; Sueldo y Otros ingresos; S&P 500, Cripto, Depósitos y Otras inversiones.
- Cada usuario recibe su propia copia. Crear personalizadas, renombrar, cambiar color, deshabilitar y reactivar. No hay eliminación.
- Renombrar se refleja también en el historial. Deshabilitar impide nuevas selecciones, manteniendo los registros y reportes anteriores.
- Añadir predeterminadas a usuarios existentes solo tras comprobar sus categorías, sin sobrescribir nombres personalizados ni reactivar categorías que deshabilitaron.

### Movimientos y recurrentes

- Registro rápido con monto y categoría; descripción con sugerencias frecuentes y recientes. Fecha opcional = hoy en Lima; cuenta opcional = predeterminada, mostrada por nombre.
- Ingresos con categoría de ingreso y cuenta que recibe el dinero. Transferencias con origen y destino, sin categoría de gasto.
- Buscar por descripción; filtrar por rango, tipo, cuenta y categoría. Los filtros procedentes del Resumen deben llegar a esta lista, que hoy solo utiliza el mes.
- Editar y eliminar dentro de un menú. Confirmación de eliminación con descripción, monto y fecha; mostrar errores de base de datos y estado de envío. No colocar una X destructiva como acción principal en cada fila.
- Recurrentes accesibles desde Movimientos: sueldo como ingreso; renta y suscripciones como gastos; transferencias internas como transferencias. No tratarlos a todos como un mismo tipo.
- Crear regla con frecuencia, inicio, fin opcional y próxima ejecución; pausar, reactivar y editar futuras ocurrencias.
- Generar vencidos una sola vez, incluso con dos ejecuciones simultáneas. Una ejecución fallida debe poder reintentarse sin duplicar movimientos.
- Fechas ancladas al día original: para el día 31, usar el último día de los meses cortos y volver al 31 cuando exista.
- No generar movimientos nuevos contra cuentas, categorías o inversiones deshabilitadas: dejar el motivo visible para corregir la regla.

## 9. Trabajo técnico y conservación de datos

1. Mantener una única tabla de movimientos, saldos calculados, céntimos enteros y fechas de Lima. No guardar saldos editables que puedan desincronizarse.
2. Compartir cálculos de totales y criterios de filtros entre Resumen, Movimientos, Inversiones y Presupuestos. Incluir rescates y distinguir ejecutado de futuro.
3. Introducir únicamente migraciones nuevas. Nuevas tablas con dueño, RLS y referencias del mismo usuario; vistas con seguridad del consultante. Mantener el aislamiento de los dos usuarios.
4. Añadir reglas de inversión activa y categoría activa al registrar nuevos aportes y crear posiciones. El esquema actual no comprueba todos estos estados para inversiones.
5. Crear aportes, transferencias y reglas con operaciones atómicas y protección contra envíos duplicados. No confiar solo en deshabilitar un botón.
6. Calcular agregados completos en SQL o recuperar todos los registros con paginación. Revisar los límites de respuesta configurados: dos usuarios no implica que su historial sea siempre pequeño.
7. Generar tipos de la base para reducir conversiones manuales y tratar errores de todas las consultas. Añadir páginas de error y de registro no encontrado en español.
8. Preparar una migración de datos que liste categorías y movimientos candidatos, con conteos y saldos antes/después. No convertir una categoría de gasto llamada Inversión en aportes reales solo por su nombre.
9. Si hay gastos históricos que en realidad eran aportes, definir su correspondencia con una inversión y transformar el mismo movimiento, conservando su ID cuando sea posible. El saldo antes y después debe coincidir; no insertar un segundo egreso.
10. Añadir claves estables a las plantillas predeterminadas para no duplicarlas cuando se renombren o se vuelva a ejecutar la inicialización.
11. Antes de aplicar migraciones a la base real: respaldo, ensayo en copia o entorno local y reporte del cambio. La revisión actual no ha tocado la base remota.
12. Actualizar documentación para distinguir esquema disponible, pantalla implementada y función comprobada con usuario. Ninguna tabla implica por sí sola que el requisito esté terminado.

## 10. Orden de ejecución y entregables

| Orden | Entrega | Criterio de cierre |
|---|---|---|
| 0 | Contrato de métricas, navegación y datos; inventario de migración y diagnóstico del fallo de compilación actual. | Definiciones trasladadas a las tareas, documentación coherente y compilación de base comprobada. |
| 1 | Diseño revisable de Resumen, Cuentas, Inversiones y Presupuestos, en escritorio y celular. | Controles, clics, estados, tamaños y ejemplos de presupuesto se pueden revisar antes de extender el diseño. |
| 2 | Resumen analítico y Cuentas renovados; componentes compartidos y filtros. | Elegir día/mes, revisar todos los días, navegar a detalle y registrar/transferir desde cuentas funciona. |
| 3 | Inversiones y categorías iniciales, conectadas al historial y al Resumen. | Un aporte descuenta una vez; rescates y valorizaciones tienen su efecto correcto. |
| 4 | Presupuestos completos y métricas/alertas integradas. | Total mensual + porcentajes + ejecución por categoría + comparación con ingreso real funcionan. Es parte obligatoria de este MVP. |
| 5 | Recurrentes y pulido del registro, errores y navegación. | Generación y reintentos sin duplicados; autocompletado y edición conservan datos. |
| 6 | Validación integral, migración ensayada y preparación de despliegue. | Pruebas de aceptación, comprobación visual y revisión de datos sin diferencias de saldo. |

Las entregas 2, 3, 4 y 5 forman el primer MVP. No se declara completo tras mejorar únicamente el Resumen. El despliegue se prepara después de validar estas funciones; este plan no publica ni cambia configuración externa.

## 11. Pruebas de aceptación

- Rango 1–7 de octubre con movimientos solo los días 1, 3 y 7: siete intervalos diarios, ceros correctos y detalle accesible de cada día.
- Cambiar Día/Semana/Mes mantiene el total, las cuentas y las categorías seleccionadas. Probar año bisiesto, cambio de año y rangos parciales de mes.
- Leyenda oculta series, dona y tabla seleccionan categoría, punto abre detalle y Atrás restaura filtros. Comprobar en navegador, no solo en funciones de cálculo.
- Si el período anterior vale cero o tiene otro número de días, las comparaciones siguen el criterio indicado y no muestran porcentajes imposibles.
- S/ 500 de aporte resta S/ 500 a la cuenta, suma S/ 500 a inversión y ejecución presupuestaria, y no añade otro gasto por el mismo importe.
- Un rescate aumenta saldo; actualizar valor no lo cambia. Movimientos e inversiones comparten el mismo registro y destino de edición correcto.
- Transferir o pagar tarjeta no aumenta gasto, ingreso ni presupuesto ejecutado. Comprobar deuda y saldo a favor en tarjetas diferentes.
- S/ 5.000 de base y 30 % en Comida calcula S/ 1.500; con S/ 1.600 gastados muestra 106,7 % y S/ 100 de exceso tanto en Presupuestos como en Resumen.
- Registrar S/ 4.000 de ingreso real no cambia el límite anterior, pero informa de la diferencia frente a S/ 5.000 previstos. Gastos sin asignación siguen en el total.
- Copiar presupuesto de noviembre no altera octubre. Deshabilitar o renombrar una categoría conserva ejecución y reportes históricos.
- Omitir fecha y cuenta usa hoy en Lima y la predeterminada. Probar cerca del cambio de día y un error de guardado sin perder lo escrito.
- Ejecutar recurrentes dos veces y desde dos peticiones simultáneas no duplica registros. Probar fechas 29, 30 y 31 y catálogos deshabilitados.
- Dos usuarios con sesiones simultáneas no ven ni modifican cuentas, categorías, movimientos, inversiones o presupuestos ajenos.
- Probar historial que supere el límite de una respuesta para garantizar agregados completos.
- Revisar escritorio y celular, modo oscuro, teclado, foco, botones, errores, estados vacíos y datos reales autorizados. Capturas de comparación para las cuatro pantallas prioritarias.

Automatización: ampliar las pruebas de dominio y SQL para nuevas reglas, agregar recorridos integrados de navegador y ejecutar lint, pruebas, base de datos y compilación antes de cerrar la implementación. Varias comprobaciones actuales de vistas solo imprimen resultados: convertir las cifras críticas en aserciones explícitas.

## 12. Verificación inicial, antes de ejecutar el plan

Comprobado durante esta revisión, sin cambios funcionales:

- Lint: correcto.
- Pruebas unitarias: 14 correctas.
- Pruebas de esquema en Postgres en memoria: correctas, incluidas migraciones y aislamiento básico por usuario.
- Compilación de producción: falló en Turbopack al procesar estilos e iniciar un proceso auxiliar, también al repetir con permisos ampliados. La causa no está determinada y no se puede atribuir solo a las restricciones de ejecución; falta resolverla antes de considerar validado el build.
- No se hizo validación visual con una sesión real ni se comprobaron datos en Supabase remoto. Las pruebas actuales no demuestran que los clics o el diseño sean correctos.

## 13. MVP siguiente y futuro

Metas de ahorro: conservar las tablas existentes y documentar su futura pantalla, monto objetivo, fecha, aportes/retiros y barra de progreso. Decidir entonces si son reservas virtuales o dinero vinculado a una cuenta; no construir su interfaz ni añadirlas a la navegación de este MVP.

Fuera del MVP actual: sincronización con brokers, dólares y conversión de monedas, subcategorías, lectura automática de correos, rentabilidad avanzada y PWA instalable. El acceso web responsive sí pertenece al MVP actual.

## 14. Puntos que se resolverán al ejecutar

Las decisiones funcionales principales ya están respondidas. Quedan dos comprobaciones de implementación: revisar el aspecto de las cuatro pantallas con una propuesta visual concreta y comprobar qué datos reales requieren reclasificación. No se necesita volver a preguntar por categorías simples, presupuesto por porcentajes, soles, sesión ni exclusión de metas.
