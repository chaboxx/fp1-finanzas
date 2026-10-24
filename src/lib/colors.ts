// Paleta categórica validada para daltonismo (protan/deutan/tritan) en modo claro
// y oscuro. El orden importa: es el que pasa las pruebas de separación entre
// colores vecinos. Cada categoría guarda su color "claro"; en modo oscuro se usa
// el mismo tono ajustado para el fondo oscuro.
export const CATEGORY_PALETTE = [
  { light: "#2a78d6", dark: "#3987e5", name: "Azul" },
  { light: "#eb6834", dark: "#d95926", name: "Naranja" },
  { light: "#1baf7a", dark: "#199e70", name: "Aguamarina" },
  { light: "#eda100", dark: "#c98500", name: "Amarillo" },
  { light: "#e87ba4", dark: "#d55181", name: "Magenta" },
  { light: "#008300", dark: "#008300", name: "Verde" },
  { light: "#6250d6", dark: "#9085e9", name: "Violeta" },
  { light: "#e34948", dark: "#e66767", name: "Rojo" },
] as const;

// Color neutro para "Otras" y categorías sin color.
export const NEUTRAL_COLOR = { light: "#8a8984", dark: "#7c7b75" };

const DARK_BY_LIGHT = new Map<string, string>(CATEGORY_PALETTE.map((c) => [c.light, c.dark]));

export function categoryColor(color: string | null | undefined, dark: boolean): string {
  if (!color) return dark ? NEUTRAL_COLOR.dark : NEUTRAL_COLOR.light;
  return dark ? (DARK_BY_LIGHT.get(color.toLowerCase()) ?? color) : color;
}

// Dos categorías pueden tener el mismo color (lo elige el usuario). En un gráfico
// eso las haría indistinguibles: la primera conserva su color y las repetidas
// toman un color de la paleta que nadie más usa. Los items sin color (Otras) no cambian.
export function withDistinctColors<T extends { color: string | null }>(items: T[]): T[] {
  const taken = new Set(items.map((i) => i.color?.toLowerCase()).filter(Boolean));
  const free = CATEGORY_PALETTE.map((c) => c.light).filter((c) => !taken.has(c));
  const seen = new Set<string>();
  return items.map((item) => {
    if (!item.color) return item;
    const color = item.color.toLowerCase();
    if (!seen.has(color)) {
      seen.add(color);
      return item;
    }
    return { ...item, color: free.shift() ?? color };
  });
}
