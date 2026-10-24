-- =============================================================================
-- Reglas de la cuenta por defecto
--   * La primera cuenta que creas pasa a ser la cuenta por defecto.
--   * La cuenta por defecto no se puede deshabilitar (los gastos rápidos fallarían).
--   * Solo una cuenta activa puede ser la cuenta por defecto.
-- =============================================================================

create function public.accounts_set_first_as_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.profiles
  set default_account_id = new.id
  where id = new.user_id and default_account_id is null;
  return new;
end;
$$;

create trigger accounts_set_first_as_default
  after insert on public.accounts
  for each row execute function public.accounts_set_first_as_default();

create function public.accounts_protect_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.is_active and old.is_active and exists (
    select 1 from public.profiles p where p.id = new.user_id and p.default_account_id = new.id
  ) then
    raise exception 'No puedes deshabilitar tu cuenta por defecto. Primero elige otra.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger accounts_protect_default
  before update of is_active on public.accounts
  for each row execute function public.accounts_protect_default();

create function public.profiles_check_default_account()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.default_account_id is not null and exists (
    select 1 from public.accounts a where a.id = new.default_account_id and not a.is_active
  ) then
    raise exception 'La cuenta por defecto debe estar activa' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger profiles_check_default_account
  before update of default_account_id on public.profiles
  for each row execute function public.profiles_check_default_account();
