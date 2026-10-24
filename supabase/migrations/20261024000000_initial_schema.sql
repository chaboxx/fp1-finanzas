-- =============================================================================
-- Finanzas personales: esquema inicial
--
-- Convenciones:
--   * Montos en céntimos (bigint). S/ 15.50 => 1550. Nunca float.
--   * Cada tabla tiene user_id con default auth.uid(): el cliente no lo envía.
--   * Las FKs compuestas (x_id, user_id) impiden referenciar filas de otro usuario.
--   * Nada se borra salvo movimientos y registros "de detalle": lo demás se desactiva.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.account_type as enum ('cash', 'debit', 'credit', 'savings');
create type public.category_kind as enum ('expense', 'income', 'investment');
-- invest = aporte a una inversión (sale dinero de una cuenta, cuenta como egreso del mes)
-- divest = rescate de una inversión (entra dinero a una cuenta)
create type public.transaction_type as enum ('expense', 'income', 'transfer', 'invest', 'divest');
create type public.recurrence_frequency as enum ('weekly', 'monthly', 'yearly');

-- -----------------------------------------------------------------------------
-- Perfil (1:1 con auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  display_name       text,
  currency           char(3) not null default 'PEN',
  timezone           text not null default 'America/Lima',
  default_account_id uuid,
  created_at         timestamptz not null default now()
);

-- "Hoy" según la zona horaria del usuario (no la del servidor, que está en UTC).
create function public.user_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone coalesce(
    (select p.timezone from public.profiles p where p.id = auth.uid()),
    'America/Lima'
  ))::date;
$$;

-- -----------------------------------------------------------------------------
-- Cuentas / billeteras
-- -----------------------------------------------------------------------------
create table public.accounts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name                  text not null check (length(btrim(name)) between 1 and 60),
  type                  public.account_type not null,
  initial_balance_cents bigint not null default 0,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  unique (id, user_id)
);
create unique index accounts_user_name_uniq on public.accounts (user_id, lower(name));

alter table public.profiles
  add foreign key (default_account_id, id) references public.accounts (id, user_id);

-- -----------------------------------------------------------------------------
-- Categorías (gasto, ingreso e inversión). No hay categorías por defecto.
-- -----------------------------------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id  uuid, -- reservado para subcategorías (no se usa en el MVP)
  name       text not null check (length(btrim(name)) between 1 and 40),
  kind       public.category_kind not null,
  color      text check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon       text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (parent_id, user_id) references public.categories (id, user_id)
);
create unique index categories_user_kind_name_uniq on public.categories (user_id, kind, lower(name));

-- -----------------------------------------------------------------------------
-- Inversiones: la "posición" (ej. "Fondo Mutuo BCP") y sus valorizaciones.
-- Los aportes y rescates viven en transactions (type invest/divest).
-- -----------------------------------------------------------------------------
create table public.investments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null,
  name        text not null check (length(btrim(name)) between 1 and 60),
  platform    text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id)
);

create table public.investment_valuations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  investment_id uuid not null,
  valued_on     date not null default public.user_today(),
  value_cents   bigint not null check (value_cents >= 0),
  created_at    timestamptz not null default now(),
  unique (investment_id, valued_on),
  foreign key (investment_id, user_id) references public.investments (id, user_id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- Forma válida de un movimiento según su tipo (compartida por transactions y
-- recurring_rules para no duplicar la regla).
-- -----------------------------------------------------------------------------
create function public.is_valid_movement_shape(
  t public.transaction_type,
  account_id uuid,
  to_account_id uuid,
  category_id uuid,
  investment_id uuid
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case t
    when 'expense'  then category_id is not null and to_account_id is null and investment_id is null
    when 'income'   then category_id is not null and to_account_id is null and investment_id is null
    when 'transfer' then to_account_id is not null and category_id is null and investment_id is null
                         and to_account_id is distinct from account_id
    when 'invest'   then investment_id is not null and category_id is null and to_account_id is null
    when 'divest'   then investment_id is not null and category_id is null and to_account_id is null
  end;
$$;

-- -----------------------------------------------------------------------------
-- Reglas recurrentes (sueldo, renta, suscripciones)
-- -----------------------------------------------------------------------------
create table public.recurring_rules (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type          public.transaction_type not null check (type <> 'divest'),
  amount_cents  bigint not null check (amount_cents > 0),
  description   text not null check (length(btrim(description)) between 1 and 140),
  account_id    uuid, -- null => cuenta por defecto al momento de generar
  to_account_id uuid,
  category_id   uuid,
  investment_id uuid,
  frequency     public.recurrence_frequency not null default 'monthly',
  start_on      date not null,
  end_on        date check (end_on is null or end_on >= start_on),
  next_run_on   date not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (id, user_id),
  check (public.is_valid_movement_shape(type, account_id, to_account_id, category_id, investment_id)),
  foreign key (account_id, user_id)    references public.accounts (id, user_id),
  foreign key (to_account_id, user_id) references public.accounts (id, user_id),
  foreign key (category_id, user_id)   references public.categories (id, user_id),
  foreign key (investment_id, user_id) references public.investments (id, user_id)
);

-- -----------------------------------------------------------------------------
-- Movimientos: gastos, ingresos, transferencias y aportes/rescates de inversión
-- -----------------------------------------------------------------------------
create table public.transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type              public.transaction_type not null,
  amount_cents      bigint not null check (amount_cents > 0),
  occurred_on       date not null default public.user_today(),
  description       text check (description is null or length(description) <= 140),
  notes             text,
  account_id        uuid not null, -- si llega null, el trigger pone la cuenta por defecto
  to_account_id     uuid,
  category_id       uuid,
  investment_id     uuid,
  recurring_rule_id uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (public.is_valid_movement_shape(type, account_id, to_account_id, category_id, investment_id)),
  foreign key (account_id, user_id)        references public.accounts (id, user_id),
  foreign key (to_account_id, user_id)     references public.accounts (id, user_id),
  foreign key (category_id, user_id)       references public.categories (id, user_id),
  foreign key (investment_id, user_id)     references public.investments (id, user_id),
  foreign key (recurring_rule_id, user_id) references public.recurring_rules (id, user_id)
);

create index transactions_user_date_idx     on public.transactions (user_id, occurred_on desc);
create index transactions_user_category_idx on public.transactions (user_id, category_id, occurred_on);
create index transactions_user_account_idx  on public.transactions (user_id, account_id);
create index transactions_user_desc_idx     on public.transactions (user_id, lower(description));
-- Idempotencia: una regla recurrente genera a lo más un movimiento por fecha.
create unique index transactions_recurring_once_uniq
  on public.transactions (recurring_rule_id, occurred_on)
  where recurring_rule_id is not null;

-- -----------------------------------------------------------------------------
-- Presupuestos: monto fijo por categoría y por mes (cada mes puede variar)
-- -----------------------------------------------------------------------------
create table public.budgets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id  uuid not null,
  month        date not null check (extract(day from month) = 1), -- primer día del mes
  amount_cents bigint not null check (amount_cents > 0),
  created_at   timestamptz not null default now(),
  unique (user_id, category_id, month),
  foreign key (category_id, user_id) references public.categories (id, user_id)
);

-- -----------------------------------------------------------------------------
-- Metas de ahorro (sobres virtuales: los aportes no mueven dinero entre cuentas)
-- -----------------------------------------------------------------------------
create table public.savings_goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 60),
  target_cents bigint not null check (target_cents > 0),
  target_date  date,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (id, user_id)
);

create table public.goal_contributions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id      uuid not null,
  amount_cents bigint not null check (amount_cents <> 0), -- negativo = retiro de la meta
  occurred_on  date not null default public.user_today(),
  note         text,
  created_at   timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.savings_goals (id, user_id) on delete cascade
);

-- =============================================================================
-- Reglas de negocio (triggers)
-- =============================================================================

-- Verifica que una categoría sea de alguno de los tipos permitidos.
create function public.assert_category_kind(p_category_id uuid, p_kinds public.category_kind[])
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_kind public.category_kind;
begin
  if p_category_id is null then
    return;
  end if;
  select c.kind into v_kind from public.categories c where c.id = p_category_id;
  if v_kind is null or not (v_kind = any (p_kinds)) then
    raise exception 'La categoría debe ser de tipo %', array_to_string(p_kinds, ' o ')
      using errcode = 'check_violation';
  end if;
end;
$$;

create function public.transactions_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Cuenta opcional en el formulario => cuenta por defecto del usuario.
  if new.account_id is null then
    select p.default_account_id into new.account_id
    from public.profiles p where p.id = new.user_id;
    if new.account_id is null then
      raise exception 'No indicaste cuenta y no tienes una cuenta por defecto configurada'
        using errcode = 'not_null_violation';
    end if;
  end if;

  if new.type = 'expense' then
    perform public.assert_category_kind(new.category_id, array['expense']::public.category_kind[]);
  elsif new.type = 'income' then
    perform public.assert_category_kind(new.category_id, array['income']::public.category_kind[]);
  end if;

  -- Categorías y cuentas deshabilitadas no aceptan movimientos nuevos,
  -- pero los existentes se pueden editar sin problema.
  if (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
     and exists (select 1 from public.categories c where c.id = new.category_id and not c.is_active) then
    raise exception 'La categoría está deshabilitada' using errcode = 'check_violation';
  end if;

  if (tg_op = 'INSERT' or new.account_id is distinct from old.account_id or new.to_account_id is distinct from old.to_account_id)
     and exists (select 1 from public.accounts a
                 where a.id in (new.account_id, new.to_account_id) and not a.is_active) then
    raise exception 'La cuenta está deshabilitada' using errcode = 'check_violation';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger transactions_before_write
  before insert or update on public.transactions
  for each row execute function public.transactions_before_write();

create function public.investments_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.assert_category_kind(new.category_id, array['investment']::public.category_kind[]);
  return new;
end;
$$;

create trigger investments_before_write
  before insert or update of category_id on public.investments
  for each row execute function public.investments_before_write();

create function public.budgets_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Se presupuestan egresos: gastos e inversiones (dinero que dejas de tener disponible).
  perform public.assert_category_kind(new.category_id, array['expense', 'investment']::public.category_kind[]);
  return new;
end;
$$;

create trigger budgets_before_write
  before insert or update of category_id on public.budgets
  for each row execute function public.budgets_before_write();

create function public.recurring_rules_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type = 'expense' then
    perform public.assert_category_kind(new.category_id, array['expense']::public.category_kind[]);
  elsif new.type = 'income' then
    perform public.assert_category_kind(new.category_id, array['income']::public.category_kind[]);
  end if;
  return new;
end;
$$;

create trigger recurring_rules_before_write
  before insert or update on public.recurring_rules
  for each row execute function public.recurring_rules_before_write();

-- Crea el perfil automáticamente al registrarse un usuario.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Row Level Security: cada usuario ve y modifica solo lo suyo.
-- Sin política DELETE => borrar está prohibido (cuentas, categorías, etc.).
-- =============================================================================
alter table public.profiles enable row level security;
create policy "perfil propio: leer" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "perfil propio: editar" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'categories', 'investments', 'investment_valuations', 'recurring_rules',
    'transactions', 'budgets', 'savings_goals', 'goal_contributions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "propio: leer" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format(
      'create policy "propio: crear" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format(
      'create policy "propio: editar" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;

  -- Solo se pueden borrar registros de detalle (corregir errores de captura).
  foreach t in array array['transactions', 'budgets', 'goal_contributions', 'investment_valuations'] loop
    execute format(
      'create policy "propio: borrar" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;

-- =============================================================================
-- Vistas de lectura (security_invoker => respetan RLS del usuario que consulta)
-- =============================================================================

-- Saldo por cuenta: se calcula, nunca se guarda.
create view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.user_id,
  a.name,
  a.type,
  a.is_active,
  a.initial_balance_cents + coalesce(sum(m.delta_cents), 0) as balance_cents
from public.accounts a
left join (
  select t.account_id,
         case when t.type in ('income', 'divest') then t.amount_cents else -t.amount_cents end as delta_cents
  from public.transactions t
  union all
  select t.to_account_id, t.amount_cents
  from public.transactions t
  where t.type = 'transfer'
) m on m.account_id = a.id
group by a.id;

-- Movimientos con su categoría efectiva (las inversiones heredan la de su posición).
-- Excluye transferencias: no son ni gasto ni ingreso.
create view public.categorized_movements with (security_invoker = true) as
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
  c.is_active as category_is_active
from public.transactions t
left join public.investments i on i.id = t.investment_id
join public.categories c on c.id = coalesce(t.category_id, i.category_id)
where t.type <> 'transfer';

-- Resumen mensual: ingresos vs. egresos (gasto + inversión).
create view public.monthly_summary with (security_invoker = true) as
select
  user_id,
  month,
  sum(amount_cents) filter (where type = 'income')  as income_cents,
  sum(amount_cents) filter (where type = 'expense') as expense_cents,
  sum(amount_cents) filter (where type = 'invest')  as invested_cents,
  sum(amount_cents) filter (where type = 'divest')  as divested_cents
from public.categorized_movements
group by user_id, month;

-- Avance de presupuesto por categoría y mes.
create view public.budget_progress with (security_invoker = true) as
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
  where type in ('expense', 'invest')
  group by category_id, month
) s on s.category_id = b.category_id and s.month = b.month;

-- Progreso de metas de ahorro.
create view public.goal_progress with (security_invoker = true) as
select
  g.id as goal_id,
  g.user_id,
  g.name,
  g.target_cents,
  g.target_date,
  g.is_active,
  coalesce(sum(gc.amount_cents), 0) as saved_cents,
  round(100.0 * coalesce(sum(gc.amount_cents), 0) / g.target_cents, 1) as progress_pct
from public.savings_goals g
left join public.goal_contributions gc on gc.goal_id = g.id
group by g.id;

-- =============================================================================
-- Autocompletado del formulario: descripciones frecuentes del usuario,
-- con la última categoría, cuenta y monto usados.
-- =============================================================================
create function public.suggest_descriptions(p_query text, p_limit int default 8)
returns table (
  description  text,
  type         public.transaction_type,
  category_id  uuid,
  account_id   uuid,
  amount_cents bigint,
  uses         bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with matches as (
    select t.*,
           count(*) over (partition by lower(t.description)) as uses,
           row_number() over (partition by lower(t.description) order by t.occurred_on desc, t.created_at desc) as rn
    from public.transactions t
    where t.user_id = auth.uid()
      and t.description is not null
      and t.description ilike '%' || p_query || '%'
  )
  select m.description, m.type, m.category_id, m.account_id, m.amount_cents, m.uses
  from matches m
  where m.rn = 1
  order by m.uses desc, m.occurred_on desc
  limit p_limit;
$$;
