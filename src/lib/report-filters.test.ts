import assert from "node:assert/strict";
import { it } from "node:test";
import {
  clearSelectionFilters,
  dateRangeChanges,
  hasSelectionFilters,
  queryString,
  rangeFromTrend,
} from "./report-filters";

it("limpiar selecciones conserva el período relativo y las opciones del gráfico", () => {
  const params = {
    periodo: "30d",
    cuenta: ["a", "b"],
    categoria: "food",
    tipo: "expense",
    buscar: "menú",
    agrupacion: "week",
    vista: "categorias",
  };
  assert.deepEqual(clearSelectionFilters(params), {
    periodo: "30d",
    agrupacion: "week",
    vista: "categorias",
  });
  assert.equal(hasSelectionFilters(params), true);
});
it("las fechas por sí solas no muestran limpiar filtros y tampoco se borran", () => {
  const params = { periodo: "rango", desde: "2026-10-03", hasta: "2026-10-12" };
  assert.equal(hasSelectionFilters(params), false);
  assert.deepEqual(
    clearSelectionFilters({ ...params, cuenta: "bank" }),
    params,
  );
  assert.equal(hasSelectionFilters({ cuenta: [], buscar: "  " }), false);
});
it("una selección del gráfico sustituye mes/año y conserva cuentas y categorías", () => {
  const query = new URLSearchParams(
    queryString(
      {
        periodo: "mes",
        mes: "2026-09",
        anio: "2026",
        cuenta: "bank",
        categoria: ["food", "home"],
      },
      dateRangeChanges("2026-09-03", "2026-09-09"),
    ),
  );
  assert.equal(query.get("periodo"), "rango");
  assert.equal(query.get("desde"), "2026-09-03");
  assert.equal(query.get("hasta"), "2026-09-09");
  assert.equal(query.has("mes"), false);
  assert.equal(query.has("anio"), false);
  assert.equal(query.get("cuenta"), "bank");
  assert.deepEqual(query.getAll("categoria"), ["food", "home"]);
});
it("el arrastre inverso incluye todo el último intervalo semanal o mensual", () => {
  const points = [
    { key: "2026-10-01", end: "2026-10-05" },
    { key: "2026-10-05", end: "2026-10-12" },
    { key: "2026-10-12", end: "2026-10-15" },
  ];
  assert.deepEqual(rangeFromTrend(points, 2, 0), {
    from: "2026-10-01",
    to: "2026-10-14",
  });
  assert.deepEqual(rangeFromTrend(points, 0, 1), {
    from: "2026-10-01",
    to: "2026-10-11",
  });
  assert.equal(rangeFromTrend(points, -1, 2), null);
  assert.equal(rangeFromTrend([], 0, 1), null);
});
