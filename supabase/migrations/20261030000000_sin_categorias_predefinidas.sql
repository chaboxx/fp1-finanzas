-- =============================================================================
-- Sin categorías predefinidas (decisión del usuario: cada persona crea las suyas).
-- Al registrarse solo se crea el perfil. No borra ninguna categoría existente:
-- para eso está scripts/categorias-predefinidas-2-eliminar.sql.
-- =============================================================================
create or replace function public.handle_new_user()
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

drop function if exists public.seed_categories_for_user(uuid);
