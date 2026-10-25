-- =============================================================================
-- Cuentas en dólares — PASO 2: CONVERTIR
--
-- Antes: ejecuta cuentas-a-dolares-1-vista-previa.sql con los MISMOS datos, revisa
-- que todo diga OK y respalda la base (Database → Backups).
--
-- Marca como dólares las cuentas elegidas y las inversiones que se aportaron desde
-- ellas (más las que nombres en "inversiones"). NO cambia ningún monto ni saldo:
-- solo dice que esos números siempre fueron dólares.
--
-- Es un solo bloque: si encuentra cualquier problema, no cambia nada y lo explica.
-- La base no permite cambiar la moneda de una cuenta con movimientos; este script
-- apaga esa protección solo durante el cambio y la vuelve a encender.
-- =============================================================================
do $$
declare
  -- Cambia estos datos (los mismos que en la vista previa):
  v_correo      text   := 'tu-correo@ejemplo.com';
  v_cuentas     text[] := array['Nombre de tu cuenta en dólares'];
  v_inversiones text[] := array[]::text[];

  v_usuario   uuid;
  v_ids       uuid[];
  v_inv       uuid[];
  v_dolares   uuid[];
  v_problemas text[] := array[]::text[];
  v_n         integer;
begin
  select id into v_usuario from auth.users where lower(email) = lower(v_correo);
  if v_usuario is null then
    raise exception 'No existe un usuario con el correo %', v_correo;
  end if;

  select coalesce(array_agg(id), array[]::uuid[]) into v_ids
  from public.accounts where user_id = v_usuario and name = any (v_cuentas);
  if cardinality(v_ids) <> cardinality(v_cuentas) then
    raise exception 'Alguna cuenta no existe: revisa los nombres exactos con la vista previa';
  end if;

  select coalesce(array_agg(id), array[]::uuid[]) into v_inv
  from public.investments
  where user_id = v_usuario
    and (id in (select investment_id from public.transactions where account_id = any (v_ids))
         or name = any (v_inversiones));
  if (select count(*) from public.investments where user_id = v_usuario and name = any (v_inversiones))
     < cardinality(v_inversiones) then
    raise exception 'Alguna inversión no existe: revisa los nombres exactos con la vista previa';
  end if;

  -- Cuentas que estarán en dólares después del cambio.
  select v_ids || coalesce(array_agg(id), array[]::uuid[]) into v_dolares
  from public.accounts where user_id = v_usuario and currency = 'USD';

  -- Las mismas comprobaciones que la vista previa.
  select count(*) into v_n from public.transactions t
  where t.type = 'transfer' and (t.account_id = any (v_ids) or t.to_account_id = any (v_ids))
    and ((t.account_id = any (v_dolares)) <> (t.to_account_id = any (v_dolares)));
  if v_n > 0 then v_problemas := v_problemas || (v_n || ' transferencias con cuentas en soles'); end if;

  select count(*) into v_n from public.recurring_rules r
  where r.account_id = any (v_ids) or r.to_account_id = any (v_ids) or r.investment_id = any (v_inv);
  if v_n > 0 then v_problemas := v_problemas || (v_n || ' recurrentes (solo pueden ser en soles)'); end if;

  select count(*) into v_n from public.transactions t
  where t.investment_id = any (v_inv) and not (t.account_id = any (v_dolares));
  if v_n > 0 then v_problemas := v_problemas || (v_n || ' aportes o rescates desde cuentas en soles'); end if;

  if cardinality(v_problemas) > 0 then
    raise exception 'No se cambió nada. Corrige primero: %', array_to_string(v_problemas, '; ');
  end if;

  alter table public.accounts disable trigger accounts_currency_lock;
  alter table public.investments disable trigger investments_currency_lock;
  update public.accounts set currency = 'USD' where id = any (v_ids);
  update public.investments set currency = 'USD' where id = any (v_inv);
  alter table public.accounts enable trigger accounts_currency_lock;
  alter table public.investments enable trigger investments_currency_lock;

  raise notice 'Listo: % cuentas y % inversiones ahora están en dólares. Los montos no cambiaron.',
    cardinality(v_ids), cardinality(v_inv);
end;
$$;
