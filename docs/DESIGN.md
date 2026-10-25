# Diseño del sistema: Finanzas personales

Este documento explica **cómo** está armado el sistema y **por qué**. El detalle del esquema
está en [DATABASE.md](DATABASE.md), y lo que falta en [ROADMAP.md](ROADMAP.md).

La revisión del 2026-10-24 define el MVP actualizado en [PLAN_MEJORA.md](PLAN_MEJORA.md). El presupuesto por porcentajes, las categorías predeterminadas y las pantallas de Inversiones/Presupuestos están implementados en código. La activación remota requiere la migración nueva: [ACTIVAR_MVP.md](ACTIVAR_MVP.md). Metas pasa al siguiente MVP.

## Contexto y restricciones

- Uso personal: máximo 2 usuarios, baja transaccionalidad (decenas de movimientos al día como mucho).
- Accesible desde cualquier dispositivo: web responsive, luego PWA instalable.
- Monedas: soles (PEN) y dólares (USD), cada cuenta en una sola moneda y sin tipo de cambio. Zona horaria: `America/Lima` (UTC-5, sin horario de verano).
- Registro abierto sin invitaciones (solo el dueño conoce la URL).
- Catálogos por usuario: categorías propias y típicas predeterminadas; cada usuario mantiene su copia editable y desactivable.

## Arquitectura

```
[Celular / PC]  navegador (luego PWA)
      │ HTTPS
[Next.js 16 en Vercel]
      │  proxy.ts            refresca la sesión de Supabase en cada navegación y protege rutas
      │  Server Components   leen datos (dentro de <Suspense>)
      │  Server Actions      validan con zod y escriben
      │  (navegador)         el autocompletado consulta Supabase directo (RLS lo limita)
[Supabase]
         Auth                email + contraseña, sesión en cookies (@supabase/ssr)
         Postgres            reglas de negocio en CHECK/triggers, RLS por usuario, vistas
```

**Monolito, a propósito.** Con 2 usuarios no hacen falta colas, caché, microservicios ni un
backend aparte: Next.js es el backend, y Postgres hace cumplir las reglas.

## Flujo de una lectura (ej. abrir `/cuentas`)

1. `proxy.ts` crea un cliente de Supabase con las cookies, llama a `getClaims()` (refresca el token
   si venció y reescribe las cookies) y redirige a `/login` si no hay sesión.
2. La página entrega al instante el "static shell" (título, layout) y deja un `<Suspense>` con skeleton.
3. Dentro, el componente `async` llama a `requireUser()`. Esa función hace esperar a un request real
   (`connection()`), vuelve a validar la sesión y devuelve el cliente de Supabase con el `userId`.
4. Las consultas pasan por PostgREST con el JWT del usuario: **RLS filtra las filas** y la
   aplicación nunca filtra por usuario a mano.
5. El HTML con los datos llega en streaming y reemplaza el skeleton.

## Flujo de una escritura (ej. registrar un gasto)

1. El formulario (componente cliente) llama a la Server Action `saveMovement` con `FormData`.
2. La acción valida con zod (monto → céntimos, fecha opcional, reglas por tipo) y llama a `requireUser()`.
3. `insert` en `transactions` **sin** `user_id`, y sin cuenta ni fecha si el usuario no las puso:
   - el default `auth.uid()` pone el dueño, y RLS (`with check`) lo valida;
   - el trigger pone la cuenta por defecto, y el default `user_today()` pone la fecha;
   - el CHECK y los triggers rechazan formas inválidas, categorías deshabilitadas o de otro tipo, etc.
4. Si hay error, `fromDbError` lo traduce (los triggers ya responden en español) y la acción devuelve
   también lo que se escribió, para no perderlo. Si sale bien, `refresh()` actualiza la pantalla.

## Modelo de renderizado (Next.js 16)

- **Cache Components + Partial Prefetching** activos: Next prerenderiza todo lo que puede, incluso con
  cookies. Por eso todo lo que dependa del request (sesión, `searchParams`, reloj, Supabase) va dentro
  de `<Suspense>` y detrás de `connection()`.
- Los datos **no se cachean**: cada visita consulta la base (son pocos datos y deben estar al día).
  Después de mutar, `refresh()`.
- Los filtros del dashboard viven en la **URL** (formularios con navegación de cliente): se pueden guardar
  como marcador y el botón atrás funciona.

### Selección temporal y filtros

- Los accesos rápidos se conservan al cambiar solo cuentas o categorías. Editar Desde/Hasta los sustituye por un rango explícito.
- Limpiar filtros aparece como enlace solo cuando hay cuentas, categorías, tipo o búsqueda aplicados. El enlace conserva las fechas, el acceso rápido y los controles del gráfico.
- El gráfico usa los eventos de ratón de Recharts y ReferenceArea para marcar un tramo. Al soltar, los intervalos seleccionados se convierten en fechas inclusivas, se actualiza la URL y se consultan de nuevo tarjetas y gráficos. Funciona también de derecha a izquierda.
- Se muestra el rango completo sin Brush ni controles inferiores de ampliación. El clic normal sobre un punto conserva el acceso al detalle del intervalo.
- Presupuestos usa navegación de cliente al cambiar el campo de mes. useOptimistic muestra la elección durante la carga; no requiere un botón ni una recarga del documento.

El patrón de selección está documentado en el [ejemplo oficial de Recharts](https://recharts.github.io/en-US/examples/HighlightAndZoomLineChart/).

### Convenciones de formularios

- MoneyInput restringe los campos monetarios a dígitos y un punto con hasta dos decimales, y completa los dos decimales al salir. No transforma pegados inválidos en otro monto. parseToCents aplica el mismo formato sin negativos en el servidor; la deuda de crédito se ingresa positiva y se guarda con su signo contable.

- DateInput conserva los selectores nativos de día/mes y la edición por teclado. Solicita showPicker al pulsar cualquier parte del campo; los navegadores sin soporte conservan su interacción nativa.
- RequiredMark acompaña las etiquetas obligatorias y el atributo required comunica la misma condición a las ayudas de accesibilidad. Los campos opcionales no llevan asterisco ni explicaciones de autorrelleno; se conservan sus valores por defecto actuales en el servidor.
- El acceso rápido global de movimientos muestra solo el icono +, con nombre accesible y título. Cada cuenta ocupa una tarjeta propia con 16 px de separación vertical.

## Decisiones y por qué

1. **Montos en céntimos (`bigint`).** Los `float` acumulan errores de redondeo (`0.1 + 0.2 ≠ 0.3`).
2. **Una sola tabla de movimientos.** Un `CHECK` (`is_valid_movement_shape`) garantiza la forma de cada tipo: una transferencia no tiene categoría, un gasto no tiene cuenta destino, etc. Así los reportes salen de una sola consulta.
3. **Saldo calculado, nunca guardado.** Guardarlo obliga a sincronizarlo en cada alta, edición y borrado, y algún día se desincroniza. Con este volumen, calcularlo es instantáneo (vista `account_balances`).
4. **Transferencias ≠ gasto.** Pagar la tarjeta de crédito es una transferencia débito → crédito; el gasto se registró al comprar. Evita contar dos veces.
5. **Inversión = egreso del mes** (decisión del usuario). Un aporte (`invest`) saca dinero de una cuenta y cuenta en el balance y en el presupuesto, pero se reporta separado del gasto.
6. **Soft delete.** Categorías y cuentas usan `is_active`. Sin política `DELETE` en RLS, borrar es imposible. Deshabilitadas no aceptan movimientos nuevos, pero el historial y los dashboards las siguen mostrando.
7. **Los valores por defecto viven en la base.** Cuenta vacía → cuenta por defecto (trigger); fecha vacía → hoy en Lima (`user_today()`). Cualquier cliente futuro (cron, importador, app móvil) hereda las mismas reglas.
8. **Aislamiento por usuario en tres capas**: RLS (`user_id = auth.uid()`), `user_id` con default `auth.uid()`, y FKs compuestas `(x_id, user_id)` que impiden referenciar filas de otro usuario.
9. **Cuenta por defecto protegida** (migración 2): la primera cuenta creada pasa a ser la de defecto, no se puede deshabilitar y solo una cuenta activa puede serlo. Sin esto, el gasto rápido fallaría.
10. **Defensa en profundidad en auth.** El proxy protege rutas, pero cada página y acción vuelve a verificar con `requireUser()`, y RLS protege aunque las dos capas anteriores fallen. En el servidor se usa `getClaims()` (valida la firma), no `getSession()`.
11. **Dashboard comparable.** Se compara contra los mismos días transcurridos del período anterior: el 5 de octubre contra el 1–5 de septiembre, no contra septiembre completo.
12. **Cálculos como funciones puras.** `src/lib/dashboard.ts` no conoce Supabase ni React: recibe filas y devuelve números. Se prueba sin base de datos ni navegador.
13. **Colores accesibles** (migración 3): paleta de 8 colores validada para daltonismo en modo claro y oscuro. Un gráfico nunca muestra más de 8 colores (el resto va a "Otras"); si dos categorías comparten color, la repetida toma uno libre, igual en todos los gráficos. Todo gráfico va con una tabla de valores.
14. **Recurrentes idempotentes.** Índice único `(recurring_rule_id, occurred_on)`: ejecutar el generador dos veces no duplica el sueldo.
16. **La moneda es de la cuenta y nunca se suman soles con dólares** (decisión del usuario, [PLAN_USD.md](PLAN_USD.md)). Sin tipo de cambio: la persona convierte fuera de la app. Por eso cada total dice su moneda: Resumen, Movimientos, Cuentas e Inversiones muestran un bloque por moneda; Presupuesto y Métricas siguen en soles. El selector Soles/Dólares del formulario solo filtra las cuentas: la moneda sigue guardada en la cuenta, y una cuenta con historial no cambia de moneda. Transferencias entre monedas y recurrentes en dólares quedan fuera a propósito.
15. **Consultas simples sobre consultas ingeniosas.** La lista de movimientos hace tres consultas y las une en memoria, en vez de un `select` anidado. Con este volumen cuesta lo mismo y se lee mejor.

## Decisiones descartadas

| Alternativa | Por qué no |
|---|---|
| Auth propia (usuario + contraseña, sesión de 24 h exactas) | El usuario prefirió el estándar de Supabase con email: menos código propio de seguridad. |
| Registro con código de invitación | Complejidad innecesaria para 2 usuarios. Alternativa recomendada: desactivar el registro en Supabase después de crear las cuentas. |
| Categorías por defecto (decisión anterior, reemplazada) | La revisión actual pide categorías típicas y propias. No sobrescribir las personalizaciones existentes. |
| Presupuesto como % del ingreso (decisión anterior, reemplazada) | Ahora se define un total previsto mensual y se reparte por porcentajes; el ingreso real sirve de comparación, sin cambiar esa base. |
| Tipo de cambio por movimiento para tener un único total en soles | Obliga a escribir el tipo de cambio en cada movimiento y mantener una tabla de tipos. Precisión que el usuario no necesita. |
| Moneda por movimiento (una cuenta en soles acepta un gasto en dólares) | La cuenta tendría saldo mixto ("S/ 500 + US$ 20"): el saldo deja de ser un número. |
| Neon + Drizzle | Se eligió Supabase por traer Auth + RLS integrados. Costo: el plan gratis pausa tras 7 días sin uso (se resuelve con el cron diario del Sprint 5). |
| App nativa (React Native / Flutter) | Una web responsive y luego PWA cubre celular y PC con un solo código y sin tiendas de apps. |
