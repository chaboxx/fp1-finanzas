-- =============================================================================
-- Categorías predefinidas — PASO 1: VISTA PREVIA (solo lectura, no cambia nada)
--
-- Ejecútalo en el SQL Editor de Supabase y revisa la columna "que_pasara".
-- Luego ejecuta categorias-predefinidas-2-eliminar.sql.
--
-- Qué cuenta como "predefinida": las categorías que la app creó en bloque
-- (migración 20261027000000 o al registrarse). Esa migración también marcó como
-- predefinidas categorías que tú habías creado con el mismo nombre; esas se
-- reconocen porque no se crearon en bloque y NO se tocan.
-- =============================================================================
with marcadas as (
  select c.*, count(*) over (partition by c.user_id, c.created_at) as creadas_juntas
  from public.categories c
  where c.seed_key is not null
),
uso as (
  select m.*,
    (select count(*) from public.transactions t where t.category_id = m.id) as movimientos,
    (select count(*) from public.investments i where i.category_id = m.id) as inversiones,
    (select count(*) from public.recurring_rules r where r.category_id = m.id) as recurrentes,
    (select count(*) from public.budgets b where b.category_id = m.id)
      + (select count(*) from public.budget_allocations a where a.category_id = m.id) as presupuestos,
    (select count(*) from public.categories h where h.parent_id = m.id) as subcategorias
  from marcadas m
)
select
  (select email from auth.users u where u.id = uso.user_id) as usuario,
  name as categoria,
  kind as tipo,
  case
    when creadas_juntas < 2 then 'SE CONSERVA: la creaste tú'
    when movimientos + inversiones + recurrentes + presupuestos + subcategorias = 0 then 'SE BORRA'
    else 'SE CONSERVA: está en uso (' || concat_ws(', ',
      nullif(movimientos || ' movimientos', '0 movimientos'),
      nullif(inversiones || ' inversiones', '0 inversiones'),
      nullif(recurrentes || ' recurrentes', '0 recurrentes'),
      nullif(presupuestos || ' presupuestos', '0 presupuestos'),
      nullif(subcategorias || ' subcategorías', '0 subcategorías')) || ')'
  end as que_pasara
from uso
order by usuario, que_pasara, tipo, categoria;
