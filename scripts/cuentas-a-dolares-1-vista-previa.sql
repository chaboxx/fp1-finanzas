-- =============================================================================
-- Cuentas en dólares — PASO 1: VISTA PREVIA (solo lectura, no cambia nada)
--
-- Úsalo SOLO para cuentas que ya usabas para dólares cuando la app era solo en
-- soles y en las que escribiste los montos EN DÓLARES (US$ 100 quedó como "S/ 100").
-- Los montos no cambian: solo se marca que siempre fueron dólares. Como efecto,
-- esos movimientos salen de los informes en soles (donde hoy se suman mal) y
-- aparecen en los de dólares.
--
-- No lo uses si:
--   * La cuenta no tiene movimientos: cámbiala en Cuentas → Editar → Moneda.
--   * Convertiste a soles al registrar: crea una cuenta nueva en dólares con su
--     saldo real como saldo inicial y deshabilita la antigua.
--
-- Cómo usarlo: escribe tu correo y los nombres exactos de las cuentas en "datos"
-- y ejecútalo en el SQL Editor de Supabase. Devuelve una fila por cuenta o
-- inversión que pasaría a dólares:
--   OK           se puede convertir con el paso 2
--   NO SE PUEDE  el detalle dice qué corregir antes (desde la app)
-- =============================================================================
with datos as (
  select 'tu-correo@ejemplo.com'::text as correo,
         array['Nombre de tu cuenta en dólares']::text[] as cuentas,
         -- Inversiones en dólares sin aportes desde esas cuentas (por ejemplo, las
         -- registradas con "Saldo inicial"). Déjalo vacío si no hay.
         array[]::text[] as inversiones
),
usuario as (
  select u.id from auth.users u, datos d where lower(u.email) = lower(d.correo)
),
elegidas as (
  select a.* from public.accounts a, datos d
  where a.user_id = (select id from usuario) and a.name = any (d.cuentas)
),
-- Después de convertir, estas cuentas estarán en dólares.
en_dolares as (
  select id from elegidas
  union
  select id from public.accounts where user_id = (select id from usuario) and currency = 'USD'
),
inversiones as (
  select i.* from public.investments i, datos d
  where i.user_id = (select id from usuario)
    and (i.id in (select t.investment_id from public.transactions t where t.account_id in (select id from elegidas))
         or i.name = any (d.inversiones))
),
cuentas as (
  select 'cuenta' as tipo, e.name as nombre, e.currency::text as moneda_actual,
         (select count(*) from public.transactions t where e.id in (t.account_id, t.to_account_id)) as movimientos,
         -- Una transferencia con una cuenta que seguirá en soles mezclaría monedas.
         (select count(*) from public.transactions t
           where t.type = 'transfer' and e.id in (t.account_id, t.to_account_id)
             and ((t.account_id in (select id from en_dolares)) <> (t.to_account_id in (select id from en_dolares)))) as transferencias_con_soles,
         (select count(*) from public.recurring_rules r where e.id in (r.account_id, r.to_account_id)) as recurrentes
  from elegidas e
),
posiciones as (
  select 'inversión' as tipo, i.name as nombre, i.currency::text as moneda_actual,
         (select count(*) from public.transactions t where t.investment_id = i.id) as movimientos,
         -- Aportes o rescates desde cuentas que seguirán en soles.
         (select count(*) from public.transactions t
           where t.investment_id = i.id and t.account_id not in (select id from en_dolares)) as desde_soles,
         (select count(*) from public.recurring_rules r where r.investment_id = i.id) as recurrentes
  from inversiones i
)
select tipo, nombre, moneda_actual, movimientos,
       case when transferencias_con_soles = 0 and recurrentes = 0 then 'OK' else 'NO SE PUEDE' end as estado,
       concat_ws(' · ',
         case when transferencias_con_soles > 0 then transferencias_con_soles || ' transferencias con cuentas en soles: bórralas o regístralas como gasto e ingreso' end,
         case when recurrentes > 0 then recurrentes || ' recurrentes: los recurrentes solo son en soles, cámbiales la cuenta o páusalos y bórralos' end
       ) as detalle
from cuentas
union all
select tipo, nombre, moneda_actual, movimientos,
       case when desde_soles = 0 and recurrentes = 0 then 'OK' else 'NO SE PUEDE' end,
       concat_ws(' · ',
         case when desde_soles > 0 then desde_soles || ' aportes o rescates desde cuentas en soles: una inversión tiene una sola moneda' end,
         case when recurrentes > 0 then recurrentes || ' recurrentes de aporte: los recurrentes solo son en soles' end
       )
from posiciones
union all
select 'cuenta', n, null, null, 'NO SE PUEDE', 'No existe una cuenta con ese nombre para ese correo'
from datos d, unnest(d.cuentas) n
where n not in (select name from elegidas)
union all
select 'inversión', n, null, null, 'NO SE PUEDE', 'No existe una inversión con ese nombre para ese correo'
from datos d, unnest(d.inversiones) n
where n not in (select name from inversiones);
