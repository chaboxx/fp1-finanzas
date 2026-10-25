-- =============================================================================
-- Dólares (V1 de docs/PLAN_USD.md).
--
--   * La moneda es de la cuenta y de la inversión. Un movimiento usa la de su cuenta.
--   * Sin tipo de cambio: la app nunca suma soles con dólares. Los informes agrupan
--     por moneda; presupuesto y métricas siguen en soles.
--   * Transferencias solo entre cuentas de la misma moneda.
--   * Aportes y rescates solo desde cuentas de la moneda de la inversión.
--   * Recurrentes solo en cuentas en soles.
--
-- Solo agrega: todo lo existente queda en soles y el código anterior sigue funcionando.
-- =============================================================================
create type public.currency_code as enum ('PEN', 'USD');

alter table public.accounts
  add column currency public.currency_code not null default 'PEN';
alter table public.investments
  add column currency public.currency_code not null default 'PEN';

-- -----------------------------------------------------------------------------
-- Reglas de moneda en movimientos. El nombre ordena el trigger después de
-- transactions_before_write, que es el que completa la cuenta por defecto.
-- -----------------------------------------------------------------------------
create function public.transactions_currency_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_currency public.currency_code;
begin
  select a.currency into v_currency from public.accounts a where a.id = new.account_id;

  -- <> (y no "is distinct from"): una fila que RLS oculta da null y la rechaza la FK
  -- compuesta con su propio mensaje, en vez de culpar a la moneda.
  if new.type = 'transfer'
     and v_currency <> (select a.currency from public.accounts a where a.id = new.to_account_id) then
    raise exception 'Solo puedes transferir entre cuentas de la misma moneda'
      using errcode = 'check_violation';
  end if;

  if new.type in ('invest', 'divest')
     and v_currency <> (select i.currency from public.investments i where i.id = new.investment_id) then
    raise exception 'La cuenta debe estar en la misma moneda que la inversión'
      using errcode = 'check_violation';
  end if;

  -- Un recurrente sin cuenta usa la cuenta por defecto al generarse, que podría estar en dólares.
  if new.recurring_rule_id is not null and v_currency <> 'PEN' then
    raise exception 'Los movimientos recurrentes solo pueden usar cuentas en soles'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger transactions_currency_check
  before insert or update on public.transactions
  for each row execute function public.transactions_currency_check();

create function public.recurring_rules_currency_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.accounts a
             where a.id in (new.account_id, new.to_account_id) and a.currency <> 'PEN') then
    raise exception 'Los movimientos recurrentes solo pueden usar cuentas en soles'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger recurring_rules_currency_check
  before insert or update on public.recurring_rules
  for each row execute function public.recurring_rules_currency_check();

-- La moneda no cambia cuando ya hay historial: los montos guardados dejarían de
-- significar lo que significaban.
create function public.accounts_currency_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.currency is distinct from old.currency and (
       exists (select 1 from public.transactions t where new.id in (t.account_id, t.to_account_id))
       or exists (select 1 from public.recurring_rules r where new.id in (r.account_id, r.to_account_id))
     ) then
    raise exception 'No puedes cambiar la moneda de una cuenta con movimientos'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger accounts_currency_lock
  before update of currency on public.accounts
  for each row execute function public.accounts_currency_lock();

create function public.investments_currency_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.currency is distinct from old.currency and (
       exists (select 1 from public.transactions t where t.investment_id = new.id)
       or exists (select 1 from public.investment_valuations v where v.investment_id = new.id)
       or exists (select 1 from public.recurring_rules r where r.investment_id = new.id)
     ) then
    raise exception 'No puedes cambiar la moneda de una inversión con movimientos'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger investments_currency_lock
  before update of currency on public.investments
  for each row execute function public.investments_currency_lock();

-- =============================================================================
-- Vistas: las columnas nuevas van al final (create or replace no permite otra cosa).
-- =============================================================================

-- Saldo en la moneda de la cuenta.
create or replace view public.account_balances with (security_invoker = true) as
select a.id as account_id, a.user_id, a.name, a.type, a.is_active,
  a.initial_balance_cents + coalesce(sum(m.delta_cents), 0) as balance_cents,
  a.currency
from public.accounts a
left join (
  select t.account_id,
         case when t.type in ('income', 'divest') then t.amount_cents else -t.amount_cents end as delta_cents
  from public.transactions t where t.occurred_on <= public.user_today()
  union all
  select t.to_account_id, t.amount_cents
  from public.transactions t where t.type = 'transfer' and t.occurred_on <= public.user_today()
) m on m.account_id = a.id
group by a.id;

-- Cada movimiento lleva la moneda de su cuenta para que los informes no mezclen.
create or replace view public.categorized_movements with (security_invoker = true) as
select
  t.id,
  t.user_id,
  t.type,
  t.amount_cents,
  t.occurred_on,
  date_trunc('month', t.occurred_on)::date as month,
  t.description,
  t.account_id,
  t.investment_id,
  c.id as category_id,
  c.name as category_name,
  c.kind as category_kind,
  c.color as category_color,
  c.is_active as category_is_active,
  a.currency
from public.transactions t
join public.accounts a on a.id = t.account_id
left join public.investments i on i.id = t.investment_id
join public.categories c on c.id = coalesce(t.category_id, i.category_id)
where t.type <> 'transfer';

-- Una fila por mes y moneda.
create or replace view public.monthly_summary with (security_invoker = true) as
select user_id, month,
  sum(amount_cents) filter (where type = 'income')  as income_cents,
  sum(amount_cents) filter (where type = 'expense') as expense_cents,
  sum(amount_cents) filter (where type = 'invest')  as invested_cents,
  sum(amount_cents) filter (where type = 'divest')  as divested_cents,
  currency
from public.categorized_movements
where occurred_on <= public.user_today()
group by user_id, month, currency;

-- El presupuesto está en soles: los egresos en dólares no lo consumen.
create or replace view public.budget_plan_progress with (security_invoker = true) as
select a.id, a.user_id, p.id as plan_id, p.month, p.total_cents, a.category_id, c.name as category_name,
  c.kind as category_kind, c.color as category_color, c.is_active as category_is_active, a.percentage_bps,
  floor(p.total_cents::numeric * a.percentage_bps / 10000)::bigint as budget_cents,
  coalesce(s.spent_cents, 0)::bigint as spent_cents
from public.budget_allocations a
join public.budget_plans p on p.id = a.plan_id
join public.categories c on c.id = a.category_id
left join (
  select category_id, month, sum(amount_cents) as spent_cents
  from public.categorized_movements
  where type in ('expense', 'invest') and occurred_on <= public.user_today() and currency = 'PEN'
  group by category_id, month
) s on s.category_id = a.category_id and s.month = p.month;

create or replace view public.budget_progress with (security_invoker = true) as
select
  b.id as budget_id,
  b.user_id,
  b.month,
  b.category_id,
  c.name as category_name,
  c.kind as category_kind,
  b.amount_cents as budget_cents,
  coalesce(s.spent_cents, 0) as spent_cents,
  round(100.0 * coalesce(s.spent_cents, 0) / b.amount_cents, 1) as used_pct
from public.budgets b
join public.categories c on c.id = b.category_id
left join (
  select category_id, month, sum(amount_cents) as spent_cents
  from public.categorized_movements
  where type in ('expense', 'invest') and currency = 'PEN'
  group by category_id, month
) s on s.category_id = b.category_id and s.month = b.month;

-- =============================================================================
-- Inversiones: la moneda se elige al crear la posición. p_currency al final y con
-- default, así las llamadas anteriores (sin moneda) siguen funcionando en soles.
-- =============================================================================
drop function public.save_investment_entry(text,bigint,uuid,uuid,uuid,text,text,uuid,date,text,uuid,bigint);
create function public.save_investment_entry(
 p_operation text,p_amount bigint,p_request uuid,p_investment uuid default null,
 p_category uuid default null,p_name text default null,p_platform text default null,
 p_account uuid default null,p_date date default null,p_description text default null,
 p_entry uuid default null,p_initial_capital bigint default null,
 p_currency public.currency_code default 'PEN'
) returns uuid language plpgsql set search_path='' as $$
declare v_investment uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  if p_request is null or p_amount is null or p_amount < 0 or (p_amount=0 and p_operation in('invest','divest')) then
    raise exception 'Monto o solicitud inválidos' using errcode='check_violation';
  end if;
  perform 1 from public.profiles where id=auth.uid() for update;
  if p_entry is null then
    select id into v_id from public.transactions where request_id=p_request;
    if v_id is not null then return v_id; end if;
    select id into v_id from public.investments where request_id=p_request;
    if v_id is not null then return v_id; end if;
  end if;
  if p_operation not in('invest','divest','valuation','opening') then
    raise exception 'Operación inválida' using errcode='check_violation';
  end if;
  v_investment := p_investment;
  if v_investment is null then
    if p_operation not in('invest','opening') then raise exception 'Selecciona una inversión'; end if;
    if p_category is null then raise exception 'Selecciona una categoría'; end if;
    if p_operation='invest' then
      select id into v_investment from public.investments where category_id=p_category
        and name=coalesce(nullif(btrim(p_name),''),(select name from public.categories where id=p_category))
        and currency=coalesce(p_currency,'PEN')
        and is_active order by created_at limit 1;
    end if;
    if v_investment is null then
      insert into public.investments(category_id,name,platform,initial_capital_cents,opened_on,request_id,currency)
        values(p_category,coalesce(nullif(btrim(p_name),''),(select name from public.categories where id=p_category)),
          nullif(btrim(p_platform),''),case when p_operation='opening' then p_initial_capital else 0 end,
          coalesce(p_date,public.user_today()),p_request,coalesce(p_currency,'PEN')) returning id into v_investment;
    end if;
  end if;
  if not exists(select 1 from public.investments where id=v_investment) then raise exception 'La inversión no existe'; end if;
  if p_operation in('valuation','opening') then
    insert into public.investment_valuations(investment_id,value_cents,valued_on)
      values(v_investment,p_amount,coalesce(p_date,public.user_today()))
      on conflict(investment_id,valued_on) do update set value_cents=excluded.value_cents returning id into v_id;
  elsif p_entry is not null then
    update public.transactions set amount_cents=p_amount,account_id=p_account,
      occurred_on=coalesce(p_date,occurred_on),description=p_description
      where id=p_entry and investment_id=v_investment and type=p_operation::public.transaction_type returning id into v_id;
    if v_id is null then raise exception 'El movimiento no existe'; end if;
  else
    insert into public.transactions(type,amount_cents,investment_id,account_id,occurred_on,description,request_id)
      values(p_operation::public.transaction_type,p_amount,v_investment,p_account,
        coalesce(p_date,public.user_today()),p_description,p_request) returning id into v_id;
  end if;
  return v_id;
end; $$;

grant execute on function public.save_investment_entry(text,bigint,uuid,uuid,uuid,text,text,uuid,date,text,uuid,bigint,public.currency_code) to authenticated;
