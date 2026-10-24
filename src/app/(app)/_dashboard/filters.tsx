"use client";

import Form from "next/form";
import { useState } from "react";
import type { PeriodKey } from "@/lib/dashboard";

type Option = { id: string; name: string; is_active: boolean };

type Props = {
  periodo: PeriodKey;
  mes: string;
  desde: string;
  hasta: string;
  categoria: string;
  cuenta: string;
  categories: Option[];
  accounts: Option[];
};

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "mes", label: "Mes" },
  { value: "3m", label: "Últimos 3 meses" },
  { value: "6m", label: "Últimos 6 meses" },
  { value: "anio", label: "Este año" },
  { value: "rango", label: "Rango de fechas" },
];

const control =
  "h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 dark:border-zinc-700 dark:bg-zinc-900";

// Formulario GET: los filtros viven en la URL (se pueden guardar o compartir el link)
// y <Form> de Next navega sin recargar la página.
export function DashboardFilters(props: Props) {
  const [periodo, setPeriodo] = useState(props.periodo);

  // Cada cambio aplica el filtro al instante.
  const submitOnChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => e.currentTarget.form?.requestSubmit();

  return (
    <Form action="/" className="flex flex-wrap items-end gap-2" aria-label="Filtros del dashboard">
      <Field label="Período">
        <select
          name="periodo"
          value={periodo}
          onChange={(e) => {
            setPeriodo(e.target.value as PeriodKey);
            if (e.target.value !== "rango") e.currentTarget.form?.requestSubmit();
          }}
          className={control}
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>

      {periodo === "mes" && (
        <Field label="Mes">
          <input type="month" name="mes" defaultValue={props.mes} onChange={submitOnChange} className={control} />
        </Field>
      )}
      {periodo === "rango" && (
        <>
          <Field label="Desde">
            <input type="date" name="desde" defaultValue={props.desde} required className={control} />
          </Field>
          <Field label="Hasta">
            <input type="date" name="hasta" defaultValue={props.hasta} required className={control} />
          </Field>
          <button type="submit" className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700">
            Aplicar
          </button>
        </>
      )}

      <Field label="Categoría">
        <select name="categoria" defaultValue={props.categoria} onChange={submitOnChange} className={control}>
          <option value="">Todas</option>
          {props.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.is_active ? "" : " (deshabilitada)"}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Cuenta">
        <select name="cuenta" defaultValue={props.cuenta} onChange={submitOnChange} className={control}>
          <option value="">Todas</option>
          {props.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>

      {/* Sin JavaScript, el formulario igual funciona con este botón. */}
      <noscript>
        <button type="submit" className="h-10 rounded-lg border border-zinc-300 px-4 text-sm">
          Aplicar
        </button>
      </noscript>
    </Form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
      {label}
      {children}
    </label>
  );
}
