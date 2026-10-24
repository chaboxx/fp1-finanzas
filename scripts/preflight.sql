-- Solo lectura. Ejecutar antes y después de la migración en el SQL Editor.
-- El SQL Editor tiene privilegios administrativos: este reporte abarca los usuarios existentes.
select user_id,type,count(*) as movements,sum(amount_cents) as total_cents
from public.transactions group by user_id,type order by user_id,type;

select a.user_id,a.id,a.name,a.is_active,a.initial_balance_cents,
 coalesce(sum(case when t.type in('income','divest') then t.amount_cents else -t.amount_cents end)
 filter(where t.occurred_on<=(now() at time zone 'America/Lima')::date),0)
 +a.initial_balance_cents
 +coalesce((select sum(x.amount_cents) from public.transactions x where x.to_account_id=a.id
   and x.type='transfer' and x.occurred_on<=(now() at time zone 'America/Lima')::date),0) as executed_balance_cents
from public.accounts a left join public.transactions t on t.account_id=a.id group by a.id order by a.user_id,a.name;

-- Candidatos a revisión humana. El nombre NO prueba que un gasto fuera una inversión.
select c.user_id,c.id,c.name,c.kind,c.is_active,count(t.id) as movements,coalesce(sum(t.amount_cents),0) as total_cents
from public.categories c left join public.transactions t on t.category_id=c.id
where lower(c.name) similar to '%(invers|sp500|s&p|broker|cripto)%'
group by c.id order by c.user_id,c.kind,c.name;

-- Los montos fijos previos se conservan íntegros; no se convierten automáticamente.
select user_id,month,category_id,amount_cents from public.budgets order by user_id,month,category_id;
select user_id,type,count(*) as future_movements,sum(amount_cents) as total_cents
from public.transactions where occurred_on>(now() at time zone 'America/Lima')::date group by user_id,type;
