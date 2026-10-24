-- =============================================================================
-- Paleta de categorías validada para daltonismo.
-- Migración de datos: cambia los colores de la paleta anterior por el tono más
-- parecido de la nueva. Los colores que no estén en la lista quedan igual.
-- =============================================================================
update public.categories
set color = case lower(color)
  when '#3b82f6' then '#2a78d6' -- azul
  when '#f97316' then '#eb6834' -- naranja
  when '#14b8a6' then '#1baf7a' -- turquesa  -> aguamarina
  when '#f59e0b' then '#eda100' -- ámbar     -> amarillo
  when '#ec4899' then '#e87ba4' -- rosa      -> magenta
  when '#10b981' then '#008300' -- esmeralda -> verde
  when '#84cc16' then '#008300' -- lima      -> verde
  when '#8b5cf6' then '#6250d6' -- violeta
  when '#ef4444' then '#e34948' -- rojo
  else color
end
where color is not null;
