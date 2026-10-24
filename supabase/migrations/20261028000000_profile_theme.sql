alter table public.profiles add column if not exists theme text not null default 'light'
  check(theme in('light','dark','system'));
comment on column public.profiles.theme is 'Preferencia de apariencia del usuario; claro por defecto.';

-- Consolidar las reglas del MVP también en instalaciones que aplicaron una revisión anterior.
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


create or replace function public.save_budget_plan(p_month date, p_total bigint, p_allocations jsonb)
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

create or replace function public.generate_recurring_transactions(p_until date default public.user_today(), p_user uuid default auth.uid())
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

create or replace view public.budget_plan_progress with(security_invoker=true) as
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
