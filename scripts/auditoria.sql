-- =============================================================================
-- Auditoría contable — SOLO LECTURA. No modifica nada.
--
-- Cómo usarla: copia todo este archivo en el SQL Editor de Supabase y ejecútalo.
-- Devuelve una fila por comprobación:
--   OK       todo cuadra
--   REVISAR  hay algo inconsistente: el detalle dice cuántos casos
--   INFO     dato informativo (no es un error)
-- Recomendado: ejecutarla una vez al mes y antes/después de cada migración.
-- El SQL Editor ve los datos de todos los usuarios del proyecto.
-- =============================================================================
with
hoy as (select (now() at time zone 'America/Lima')::date as d),

-- Saldo de cada cuenta recalculado desde cero, sin usar la vista de la app.
recalculado as (
  select a.id, a.user_id, a.initial_balance_cents
       + coalesce(sum(case
           when t.account_id = a.id and t.type in ('income', 'divest') then t.amount_cents
           when t.account_id = a.id and t.type in ('expense', 'invest', 'transfer') then -t.amount_cents
           when t.to_account_id = a.id and t.type = 'transfer' then t.amount_cents
           else 0 end), 0) as saldo
  from public.accounts a
  left join public.transactions t
    on (t.account_id = a.id or t.to_account_id = a.id) and t.occurred_on <= (select d from hoy)
  group by a.id
),

-- Por usuario y moneda: lo que hay en las cuentas vs. lo que debería haber según los
-- movimientos. Soles y dólares se cuadran por separado: nunca se suman.
conservacion as (
  select u.user_id, u.currency,
         coalesce((select sum(b.balance_cents) from public.account_balances b
                   where b.user_id = u.user_id and b.currency = u.currency), 0) as en_cuentas,
         coalesce((select sum(initial_balance_cents) from public.accounts a
                   where a.user_id = u.user_id and a.currency = u.currency), 0)
       + coalesce((select sum(case when t.type in ('income', 'divest') then t.amount_cents
                                   when t.type in ('expense', 'invest') then -t.amount_cents else 0 end)
                   from public.transactions t join public.accounts a on a.id = t.account_id
                   where t.user_id = u.user_id and a.currency = u.currency
                     and t.occurred_on <= (select d from hoy)), 0) as esperado
  from (select distinct user_id, currency from public.accounts) u
),

resumen_directo as (
  select t.user_id, date_trunc('month', t.occurred_on)::date as month, a.currency,
         sum(t.amount_cents) filter (where t.type = 'income')  as income,
         sum(t.amount_cents) filter (where t.type = 'expense') as expense,
         sum(t.amount_cents) filter (where t.type = 'invest')  as invested,
         sum(t.amount_cents) filter (where t.type = 'divest')  as divested
  from public.transactions t join public.accounts a on a.id = t.account_id
  where t.type <> 'transfer' and t.occurred_on <= (select d from hoy)
  group by 1, 2, 3
),

checks as (
  select 1 as orden, 'Saldo de cada cuenta = recálculo desde los movimientos' as comprobacion,
         (select count(*) from recalculado r join public.account_balances b on b.account_id = r.id where b.balance_cents <> r.saldo) as problemas,
         'cuentas con diferencia' as unidad
  union all
  select 2, 'Dinero total por usuario y moneda = saldos iniciales + ingresos + rescates − gastos − aportes',
         (select count(*) from conservacion where en_cuentas <> esperado), 'monedas descuadradas'
  union all
  select 3, 'Montos mayores a cero',
         (select count(*) from public.transactions where amount_cents <= 0), 'movimientos'
  union all
  select 4, 'Forma válida de cada movimiento (transferencias sin categoría, gastos con categoría, etc.)',
         (select count(*) from public.transactions
           where not public.is_valid_movement_shape(type, account_id, to_account_id, category_id, investment_id)), 'movimientos'
  union all
  select 5, 'Gastos con categoría de gasto e ingresos con categoría de ingreso',
         (select count(*) from public.transactions t join public.categories c on c.id = t.category_id
           where (t.type = 'expense' and c.kind <> 'expense') or (t.type = 'income' and c.kind <> 'income')), 'movimientos'
  union all
  select 6, 'Cuentas, categorías e inversiones del mismo dueño que el movimiento',
         (select count(*) from public.transactions t
            left join public.accounts a on a.id = t.account_id
            left join public.accounts d on d.id = t.to_account_id
            left join public.categories c on c.id = t.category_id
            left join public.investments i on i.id = t.investment_id
           where a.user_id <> t.user_id or d.user_id <> t.user_id or c.user_id <> t.user_id or i.user_id <> t.user_id
              or a.id is null), 'movimientos'
  union all
  select 7, 'Recurrentes sin duplicados (una ocurrencia por regla y fecha)',
         (select count(*) from (select 1 from public.transactions where recurring_rule_id is not null
            group by recurring_rule_id, occurred_on having count(*) > 1) x), 'duplicados'
  union all
  select 8, 'Presupuestos repartidos como máximo al 100 %',
         (select count(*) from (select plan_id from public.budget_allocations group by plan_id having sum(percentage_bps) > 10000) x), 'presupuestos'
  union all
  select 9, 'Resumen mensual = suma directa de los movimientos',
         (select count(*) from resumen_directo r full join public.monthly_summary m
           on m.user_id = r.user_id and m.month = r.month and m.currency = r.currency
           where coalesce(r.income, 0) <> coalesce(m.income_cents, 0) or coalesce(r.expense, 0) <> coalesce(m.expense_cents, 0)
              or coalesce(r.invested, 0) <> coalesce(m.invested_cents, 0) or coalesce(r.divested, 0) <> coalesce(m.divested_cents, 0)), 'meses'
  union all
  select 10, 'Presupuesto ejecutado = gastos + aportes en soles de la categoría en el mes',
         (select count(*) from public.budget_plan_progress p
           where p.spent_cents <> coalesce((select sum(m.amount_cents) from public.categorized_movements m
               where m.category_id = p.category_id and m.month = p.month and m.type in ('expense', 'invest')
                 and m.currency = 'PEN' and m.occurred_on <= (select d from hoy)), 0)), 'categorías'
  union all
  select 11, 'Transferencias, aportes y rescates en una sola moneda',
         (select count(*) from public.transactions t
            join public.accounts a on a.id = t.account_id
            left join public.accounts d on d.id = t.to_account_id
            left join public.investments i on i.id = t.investment_id
           where d.currency <> a.currency or i.currency <> a.currency), 'movimientos'
  union all
  select 12, 'Recurrentes solo en cuentas en soles',
         (select count(*) from public.recurring_rules r
           where exists (select 1 from public.accounts a
                         where a.id in (r.account_id, r.to_account_id) and a.currency <> 'PEN')), 'reglas'
)
select comprobacion, case when problemas = 0 then 'OK' else 'REVISAR' end as estado,
       case when problemas = 0 then '' else problemas || ' ' || unidad end as detalle
from checks
union all
select 'Movimientos programados a futuro (aún no tocan los saldos)', 'INFO',
       count(*) || ' movimientos' from public.transactions where occurred_on > (select d from hoy)
union all
select 'Reglas recurrentes con error pendiente', case when count(*) = 0 then 'OK' else 'REVISAR' end,
       case when count(*) = 0 then '' else count(*) || ' reglas (revisa Movimientos → Recurrentes)' end
from public.recurring_rules where last_error is not null
union all
select 'Cuentas que no son tarjeta con saldo negativo', case when count(*) = 0 then 'OK' else 'INFO' end,
       case when count(*) = 0 then '' else count(*) || ' cuentas (¿falta registrar un ingreso?)' end
from public.account_balances where type <> 'credit' and balance_cents < 0;
