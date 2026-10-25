-- =============================================================================
-- Categorías predefinidas — PASO 2: ELIMINAR
--
-- Antes: ejecuta categorias-predefinidas-1-vista-previa.sql y respalda la base
-- (Database → Backups, o exporta la tabla categories).
--
-- Borra SOLO las categorías que la app creó en bloque y que no se usan en ningún
-- movimiento, inversión, recurrente, presupuesto ni subcategoría. Las que están en
-- uso se conservan para no perder historial: si no quieres verlas, deshabilítalas
-- desde la pantalla Categorías. Tus saldos no cambian.
--
-- Es una sola sentencia: o se aplica completa o no se aplica nada.
-- Devuelve la lista de lo que borró.
-- Para que no se vuelvan a crear al registrar usuarios nuevos, aplica también la
-- migración 20261030000000_sin_categorias_predefinidas.sql.
-- =============================================================================
with marcadas as (
  select c.id, count(*) over (partition by c.user_id, c.created_at) as creadas_juntas
  from public.categories c
  where c.seed_key is not null
)
delete from public.categories c
using marcadas m
where c.id = m.id
  and m.creadas_juntas >= 2
  and not exists (select 1 from public.transactions t where t.category_id = c.id)
  and not exists (select 1 from public.investments i where i.category_id = c.id)
  and not exists (select 1 from public.recurring_rules r where r.category_id = c.id)
  and not exists (select 1 from public.budgets b where b.category_id = c.id)
  and not exists (select 1 from public.budget_allocations a where a.category_id = c.id)
  and not exists (select 1 from public.categories h where h.parent_id = c.id)
returning (select email from auth.users u where u.id = c.user_id) as usuario, c.name as categoria_borrada, c.kind as tipo;
