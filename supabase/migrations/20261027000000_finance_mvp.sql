-- Ampliación del MVP. No reclasifica ni elimina movimientos existentes.
create or replace view public.account_balances with(security_invoker=true) as
select a.id as account_id,a.user_id,a.name,a.type,a.is_active,
 a.initial_balance_cents+coalesce(sum(m.delta_cents),0) as balance_cents
from public.accounts a left join (
 select t.account_id,case when t.type in('income','divest') then t.amount_cents else -t.amount_cents end as delta_cents
 from public.transactions t where t.occurred_on<=public.user_today()
 union all
 select t.to_account_id,t.amount_cents from public.transactions t where t.type='transfer' and t.occurred_on<=public.user_today()
) m on m.account_id=a.id group by a.id;

create or replace view public.monthly_summary with(security_invoker=true) as
select user_id,month,
 sum(amount_cents) filter(where type='income') as income_cents,
 sum(amount_cents) filter(where type='expense') as expense_cents,
 sum(amount_cents) filter(where type='invest') as invested_cents,
 sum(amount_cents) filter(where type='divest') as divested_cents
from public.categorized_movements where occurred_on<=public.user_today() group by user_id,month;

alter table public.categories add column seed_key text;
create unique index categories_seed_uniq on public.categories(user_id, seed_key);
alter table public.transactions add column request_id uuid;
alter table public.transactions add constraint transactions_request_uniq unique(user_id, request_id);
alter table public.investments add column initial_capital_cents bigint check(initial_capital_cents >= 0);
alter table public.investments add column opened_on date;
alter table public.investments add column request_id uuid;
alter table public.investments add constraint investments_request_uniq unique(user_id, request_id);
alter table public.recurring_rules add column occurrence_index integer not null default 0 check(occurrence_index >= 0);
alter table public.recurring_rules add column last_error text;
update public.recurring_rules set occurrence_index = greatest(0, case frequency
  when 'weekly' then (next_run_on - start_on) / 7
  when 'monthly' then (extract(year from age(date_trunc('month',next_run_on),date_trunc('month',start_on))) * 12 + extract(month from age(date_trunc('month',next_run_on),date_trunc('month',start_on))))::integer
  else extract(year from next_run_on)::integer - extract(year from start_on)::integer end);

create table public.budget_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month date not null check(extract(day from month) = 1),
  total_cents bigint not null check(total_cents > 0),
  updated_at timestamptz not null default now(),
  unique(user_id, month), unique(id, user_id)
);
create table public.budget_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_id uuid not null,
  category_id uuid not null,
  percentage_bps integer not null check(percentage_bps > 0 and percentage_bps <= 10000),
  foreign key(plan_id,user_id) references public.budget_plans(id,user_id) on delete cascade,
  foreign key(category_id,user_id) references public.categories(id,user_id),
  unique(plan_id,category_id)
);
alter table public.budget_plans enable row level security;
alter table public.budget_allocations enable row level security;
create policy own_plans on public.budget_plans for all to authenticated
  using(user_id = (select auth.uid())) with check(user_id = (select auth.uid()));
create policy own_allocations on public.budget_allocations for all to authenticated
  using(user_id = (select auth.uid())) with check(user_id = (select auth.uid()));

create function public.check_budget_allocation() returns trigger language plpgsql set search_path = '' as $$
begin
  -- Bloquear la cabecera serializa también escrituras directas concurrentes.
  perform 1 from public.budget_plans where id = new.plan_id for update;
  perform public.assert_category_kind(new.category_id, array['expense','investment']::public.category_kind[]);
  if (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
    and exists(select 1 from public.categories where id = new.category_id and not is_active) then
    raise exception 'La categoría está deshabilitada' using errcode = 'check_violation';
  end if;
  if new.percentage_bps + coalesce((select sum(percentage_bps) from public.budget_allocations
      where plan_id = new.plan_id and id <> new.id),0) > 10000 then
    raise exception 'Los porcentajes no pueden superar el 100 %%' using errcode = 'check_violation';
  end if;
  return new;
end; $$;
create trigger budget_allocations_check before insert or update on public.budget_allocations
  for each row execute function public.check_budget_allocation();

create function public.save_budget_plan(p_month date, p_total bigint, p_allocations jsonb)
returns uuid language plpgsql set search_path = '' as $$
declare v_plan uuid;
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  perform 1 from public.profiles where id = auth.uid() for update;
  insert into public.budget_plans(month,total_cents) values(p_month,p_total)
    on conflict(user_id,month) do update set total_cents=excluded.total_cents, updated_at=now()
    returning id into v_plan;
  -- Se conserva una categoría deshabilitada si ya pertenecía al plan.
  if exists(select 1 from jsonb_to_recordset(p_allocations) as x(category_id uuid, percentage_bps integer)
    join public.categories c on c.id=x.category_id
    where not c.is_active and not exists(select 1 from public.budget_allocations a
      where a.plan_id=v_plan and a.category_id=x.category_id)) then
    raise exception 'La categoría está deshabilitada' using errcode='check_violation';
  end if;
  delete from public.budget_allocations where plan_id=v_plan
    and category_id not in(select x.category_id from jsonb_to_recordset(p_allocations) as x(category_id uuid));
  -- Actualizar reducciones antes de incrementos evita rechazar una redistribución válida.
  update public.budget_allocations a set percentage_bps=x.percentage_bps
    from jsonb_to_recordset(p_allocations) as x(category_id uuid,percentage_bps integer)
    where a.plan_id=v_plan and a.category_id=x.category_id and x.percentage_bps<a.percentage_bps;
  update public.budget_allocations a set percentage_bps=x.percentage_bps
    from jsonb_to_recordset(p_allocations) as x(category_id uuid,percentage_bps integer)
    where a.plan_id=v_plan and a.category_id=x.category_id;
  insert into public.budget_allocations(plan_id,category_id,percentage_bps)
    select v_plan,x.category_id,x.percentage_bps from jsonb_to_recordset(p_allocations) as x(category_id uuid,percentage_bps integer)
    where not exists(select 1 from public.budget_allocations a where a.plan_id=v_plan and a.category_id=x.category_id);
  return v_plan;
end; $$;

create view public.budget_plan_progress with(security_invoker=true) as
select a.id,a.user_id,p.id as plan_id,p.month,p.total_cents,a.category_id,c.name as category_name,
 c.kind as category_kind,c.color as category_color,c.is_active as category_is_active,a.percentage_bps,
 floor(p.total_cents::numeric*a.percentage_bps/10000)::bigint as budget_cents,
 coalesce(s.spent_cents,0)::bigint as spent_cents
from public.budget_allocations a join public.budget_plans p on p.id=a.plan_id
join public.categories c on c.id=a.category_id
left join (
  select category_id,month,sum(amount_cents) as spent_cents from public.categorized_movements
  where type in('expense','invest') and occurred_on <= public.user_today() group by category_id,month
) s on s.category_id=a.category_id and s.month=p.month;

create function public.check_investment_movement() returns trigger language plpgsql set search_path='' as $$
begin
  if new.type in('invest','divest') and (tg_op='INSERT' or new.investment_id is distinct from old.investment_id) then
    if not exists(select 1 from public.investments i join public.categories c on c.id=i.category_id
      where i.id=new.investment_id and i.is_active and c.is_active and c.kind='investment') then
      raise exception 'La inversión o su categoría está deshabilitada' using errcode='check_violation';
    end if;
  end if;
  return new;
end; $$;
create trigger transactions_investment_check before insert or update on public.transactions
  for each row execute function public.check_investment_movement();

create or replace function public.investments_before_write() returns trigger language plpgsql set search_path='' as $$
begin
  perform public.assert_category_kind(new.category_id,array['investment']::public.category_kind[]);
  if (tg_op='INSERT' or new.category_id is distinct from old.category_id)
    and exists(select 1 from public.categories where id=new.category_id and not is_active) then
    raise exception 'La categoría está deshabilitada' using errcode='check_violation';
  end if;
  return new;
end; $$;

create function public.save_investment_entry(
 p_operation text,p_amount bigint,p_request uuid,p_investment uuid default null,
 p_category uuid default null,p_name text default null,p_platform text default null,
 p_account uuid default null,p_date date default null,p_description text default null,
 p_entry uuid default null,p_initial_capital bigint default null
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
        and is_active order by created_at limit 1;
    end if;
    if v_investment is null then
      insert into public.investments(category_id,name,platform,initial_capital_cents,opened_on,request_id)
        values(p_category,coalesce(nullif(btrim(p_name),''),(select name from public.categories where id=p_category)),
          nullif(btrim(p_platform),''),case when p_operation='opening' then p_initial_capital else 0 end,
          coalesce(p_date,public.user_today()),p_request) returning id into v_investment;
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

create function public.recurrence_date(p_start date,p_frequency public.recurrence_frequency,p_index integer)
returns date language sql immutable set search_path='' as $$
 select case p_frequency when 'weekly' then p_start + p_index*7
 when 'monthly' then (p_start + make_interval(months=>p_index))::date
 else (p_start + make_interval(years=>p_index))::date end;
$$;

create function public.generate_recurring_transactions(p_until date default public.user_today(), p_user uuid default auth.uid())
returns integer language plpgsql set search_path='' as $$
declare r public.recurring_rules; v_count integer:=0; v_iterations integer; v_rule_count integer; v_due date;
begin
  if p_user is null or (p_user is distinct from auth.uid()
    and coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role'
    and current_user <> 'service_role') then raise exception 'Acceso denegado'; end if;
  -- No se contabiliza el futuro aunque un cliente solicite otra fecha.
  p_until:=least(p_until,(now() at time zone 'America/Lima')::date);
  for r in select * from public.recurring_rules where user_id=p_user and is_active and next_run_on<=p_until
    order by id for update skip locked loop
    v_iterations:=0;
    v_rule_count:=0;
    begin
      loop
        v_due:=public.recurrence_date(r.start_on,r.frequency,r.occurrence_index);
        exit when v_due>p_until or (r.end_on is not null and v_due>r.end_on) or v_iterations>=400;
        insert into public.transactions(user_id,type,amount_cents,description,account_id,to_account_id,category_id,investment_id,recurring_rule_id,occurred_on)
          values(r.user_id,r.type,r.amount_cents,r.description,r.account_id,r.to_account_id,r.category_id,r.investment_id,r.id,v_due)
          on conflict(recurring_rule_id,occurred_on) where recurring_rule_id is not null do nothing;
        if found then v_rule_count:=v_rule_count+1; end if;
        r.occurrence_index:=r.occurrence_index+1;
        v_iterations:=v_iterations+1;
      end loop;
      update public.recurring_rules set occurrence_index=r.occurrence_index,next_run_on=v_due,last_error=null,
        is_active=not (r.end_on is not null and v_due>r.end_on) where id=r.id;
      v_count:=v_count+v_rule_count;
    exception when others then
      update public.recurring_rules set last_error=sqlerrm where id=r.id;
    end;
  end loop;
  return v_count;
end; $$;

create or replace function public.recurring_rules_before_write() returns trigger language plpgsql set search_path='' as $$
begin
 if new.type='expense' then perform public.assert_category_kind(new.category_id,array['expense']::public.category_kind[]);
 elsif new.type='income' then perform public.assert_category_kind(new.category_id,array['income']::public.category_kind[]); end if;
 if new.is_active and (tg_op='INSERT' or new.is_active is distinct from old.is_active
   or new.category_id is distinct from old.category_id or new.account_id is distinct from old.account_id
   or new.to_account_id is distinct from old.to_account_id or new.investment_id is distinct from old.investment_id
   or new.type is distinct from old.type) then
  if exists(select 1 from public.categories where id=new.category_id and not is_active) then
   raise exception 'La categoría está deshabilitada' using errcode='check_violation'; end if;
  if exists(select 1 from public.accounts where id in(new.account_id,new.to_account_id) and not is_active) then
   raise exception 'La cuenta está deshabilitada' using errcode='check_violation'; end if;
  if new.type='invest' and not exists(select 1 from public.investments i join public.categories c on c.id=i.category_id
    where i.id=new.investment_id and i.is_active and c.is_active) then
   raise exception 'La inversión o su categoría está deshabilitada' using errcode='check_violation'; end if;
 end if;
 return new;
end; $$;

create function public.seed_categories_for_user(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r record;
begin
  for r in select * from (values
   ('food','Alimentación','expense','#2a78d6'),('home','Vivienda','expense','#eb6834'),
   ('transport','Transporte','expense','#1baf7a'),('services','Servicios','expense','#eda100'),
   ('health','Salud','expense','#e87ba4'),('fun','Entretenimiento','expense','#6250d6'),
   ('shopping','Compras','expense','#e34948'),('other-expense','Otros gastos','expense','#008300'),
   ('salary','Sueldo','income','#1baf7a'),('other-income','Otros ingresos','income','#2a78d6'),
   ('sp500','S&P 500','investment','#2a78d6'),('crypto','Cripto','investment','#eda100'),
   ('deposits','Depósitos','investment','#1baf7a'),('other-investment','Otras inversiones','investment','#6250d6')
  ) as t(key,name,kind,color) loop
    if exists(select 1 from public.categories where user_id=p_user and seed_key=r.key) then continue; end if;
    if exists(select 1 from public.categories where user_id=p_user and kind=r.kind::public.category_kind and lower(name)=lower(r.name)) then
      update public.categories set seed_key=r.key where user_id=p_user and kind=r.kind::public.category_kind
        and lower(name)=lower(r.name) and seed_key is null;
    else
      insert into public.categories(user_id,seed_key,name,kind,color)
        values(p_user,r.key,r.name,r.kind::public.category_kind,r.color);
    end if;
  end loop;
end; $$;
revoke all on function public.seed_categories_for_user(uuid) from public;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id) values(new.id);
  perform public.seed_categories_for_user(new.id);
  return new;
end; $$;
do $$ declare r record; begin
  for r in select id from public.profiles loop perform public.seed_categories_for_user(r.id); end loop;
end; $$;

-- Filtrar el tipo antes de limitar evita perder sugerencias de gastos por ingresos.
drop function public.suggest_descriptions(text,integer);
create function public.suggest_descriptions(p_query text,p_limit integer default 8,p_type public.transaction_type default null)
returns table(description text,type public.transaction_type,category_id uuid,account_id uuid,amount_cents bigint,uses bigint)
language sql stable security invoker set search_path='' as $$
 with matches as (
 select t.*,count(*) over(partition by lower(t.description),t.type) as uses,
 row_number() over(partition by lower(t.description),t.type order by t.occurred_on desc,t.created_at desc) as rn
 from public.transactions t where t.user_id=auth.uid() and t.description is not null
 and (p_type is null or t.type=p_type)
 and t.description ilike '%' || replace(replace(replace(p_query,'\','\\'),'%','\%'),'_','\_') || '%'
 ) select m.description,m.type,m.category_id,m.account_id,m.amount_cents,m.uses from matches m
 where rn=1 order by uses desc,occurred_on desc limit greatest(1,least(p_limit,20));
$$;

grant select,insert,update,delete on public.budget_plans,public.budget_allocations to authenticated;
grant select on public.budget_plan_progress to authenticated;
grant execute on function public.save_budget_plan(date,bigint,jsonb) to authenticated;
grant execute on function public.save_investment_entry(text,bigint,uuid,uuid,uuid,text,text,uuid,date,text,uuid,bigint) to authenticated;
grant execute on function public.generate_recurring_transactions(date,uuid) to authenticated;
grant execute on function public.suggest_descriptions(text,integer,public.transaction_type) to authenticated;
