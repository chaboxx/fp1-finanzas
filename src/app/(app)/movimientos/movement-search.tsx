import Form from "next/form";
import type { Params } from "@/lib/dashboard";

export const movementTypeLabels = {
  expense: "Gasto",
  income: "Ingreso",
  transfer: "Transferencia",
  invest: "Aporte a inversión",
  divest: "Rescate",
};

export function MovementSearch({
  params,
  action = "/movimientos",
}: {
  params: Params;
  action?: string;
}) {
  return (
    <Form
      action={action}
      scroll={false}
      aria-label="Buscar movimientos"
      className="panel mb-6 flex flex-wrap items-end gap-3"
    >
      {Object.entries(params)
        .filter(([key]) => !["tipo", "buscar"].includes(key))
        .flatMap(([key, value]) =>
          (Array.isArray(value) ? value : [value]).map((item, index) =>
            item ? (
              <input key={key + index} type="hidden" name={key} value={item} />
            ) : null,
          ),
        )}
      <label className="min-w-48 flex-1 text-xs font-medium text-slate-500">
        Buscar
        <input
          className="field mt-1.5"
          name="buscar"
          defaultValue={String(params.buscar ?? "")}
          placeholder="Descripción, categoría o inversión"
        />
      </label>
      <label className="text-xs font-medium text-slate-500">
        Tipo
        <select
          name="tipo"
          className="field mt-1.5"
          defaultValue={String(params.tipo ?? "")}
        >
          <option value="">Todos</option>
          {Object.entries(movementTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
          <option value="outflow">Gastos + aportes</option>
        </select>
      </label>
      <button type="submit" className="btn btn-primary">
        Buscar
      </button>
    </Form>
  );
}
