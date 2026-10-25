"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { DateInput } from "@/components/date-input";
import { RequiredMark } from "@/components/required-mark";
import {
  addDays,
  addMonths,
  type Params,
  type Period,
  values,
} from "@/lib/dashboard";
import type { Account, Category } from "@/lib/types";
import {
  clearSelectionFilters,
  hasSelectionFilters,
  queryString,
} from "@/lib/report-filters";
export { queryString } from "@/lib/report-filters";
export function DashboardFilters({
  params,
  period,
  accounts,
  categories,
  basePath = "/",
}: {
  params: Params;
  period: Period;
  accounts: Account[];
  categories: Category[];
  basePath?: string;
}) {
  const [pending, startTransition] = useTransition(),
    router = useRouter();
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(addDays(period.to, -1));
  const datesChanged = from !== period.from || to !== addDays(period.to, -1);
  const selectedAccounts = values(params, "cuenta"),
    selectedCategories = values(params, "categoria");
  const metric =
    typeof params.metrica === "string" ? params.metrica : "expense";
  const usable = categories.filter((c) =>
    basePath === "/movimientos"
      ? true
      : metric === "income"
        ? c.kind === "income"
        : metric === "invest"
          ? c.kind === "investment"
          : metric === "expense"
            ? c.kind === "expense"
            : c.kind !== "income",
  );
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = new URLSearchParams();
    for (const [k, v] of new FormData(e.currentTarget))
      if (String(v)) q.append(k, String(v));
    if (!datesChanged && period.key !== "rango") {
      q.set("periodo", period.key);
      q.delete("desde");
      q.delete("hasta");
      if (period.key === "mes" && typeof params.mes === "string")
        q.set("mes", params.mes);
      if (period.key === "anio" && typeof params.anio === "string")
        q.set("anio", params.anio);
    }
    startTransition(() =>
      router.push(basePath + "?" + q.toString(), { scroll: false }),
    );
  }
  const adjacent = (delta: number) =>
    period.key === "mes"
      ? { mes: addMonths(period.from, delta).slice(0, 7) }
      : period.key === "anio"
        ? { anio: String(Number(period.from.slice(0, 4)) + delta) }
        : null;
  return (
    <section
      className={"panel mb-6 transition " + (pending ? "opacity-60" : "")}
      aria-busy={pending}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="mr-1 text-blue-400">
            <Icon name="calendar" size={18} />
          </span>
          {adjacent(-1) && (
            <Link
              aria-label="Período anterior"
              className="btn btn-ghost min-h-9 px-2"
              href={basePath + "?" + queryString(params, adjacent(-1)!)}
            >
              ‹
            </Link>
          )}
          <span className="text-sm font-semibold">{period.label}</span>
          {adjacent(1) && (
            <Link
              aria-label="Período siguiente"
              className="btn btn-ghost min-h-9 px-2"
              href={basePath + "?" + queryString(params, adjacent(1)!)}
            >
              ›
            </Link>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {[
            ["hoy", "Hoy"],
            ["7d", "7 días"],
            ["30d", "30 días"],
            ["mes", "Este mes"],
            ["3m", "3 meses"],
            ["6m", "6 meses"],
            ["anio", "Este año"],
          ].map(([value, label]) => (
            <Link
              key={value}
              aria-current={
                !datesChanged && period.key === value ? "true" : undefined
              }
              className={
                "rounded-lg px-3 py-2 text-xs font-medium " +
                (!datesChanged && period.key === value
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  : "text-slate-500 hover:bg-blue-50 dark:hover:bg-slate-800")
              }
              href={
                basePath +
                "?" +
                queryString(params, {
                  periodo: value,
                  mes: null,
                  anio: null,
                  desde: null,
                  hasta: null,
                })
              }
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
      <form
        onSubmit={submit}
        action={basePath}
        className="flex flex-wrap items-end gap-3"
        aria-label="Filtros por fechas"
      >
        <input type="hidden" name="periodo" value="rango" />
        {[
          "agrupacion",
          "metrica",
          "vista",
          "comparar",
          "acumulado",
          "tipo",
          "buscar",
          "moneda",
        ].map((k) =>
          typeof params[k] === "string" ? (
            <input key={k} type="hidden" name={k} value={params[k] as string} />
          ) : null,
        )}
        <label className="min-w-40 flex-1 text-xs font-medium text-slate-500">
          Desde
          <RequiredMark />
          <DateInput
            required
            className="field mt-1.5"
            type="date"
            name="desde"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="min-w-40 flex-1 text-xs font-medium text-slate-500">
          Hasta
          <RequiredMark />
          <DateInput
            required
            className="field mt-1.5"
            type="date"
            name="hasta"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <MultiSelect
          label="Cuentas"
          name="cuenta"
          options={accounts.map((a) =>
            a.currency === "PEN" ? a : { ...a, name: a.name + " (US$)" },
          )}
          selected={selectedAccounts}
        />
        <MultiSelect
          label="Categorías"
          name="categoria"
          options={usable}
          selected={selectedCategories}
        />
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Actualizando…" : "Aplicar filtros"}
        </button>
      </form>
      {hasSelectionFilters(params) && (
        <div className="mt-3 flex justify-end">
          <Link
            className="text-xs font-medium text-slate-500 underline decoration-slate-300 underline-offset-4 hover:text-blue-600"
            href={basePath + "?" + queryString(clearSelectionFilters(params))}
          >
            Limpiar filtros
          </Link>
        </div>
      )}
      {params.periodo === "rango" && period.key !== "rango" && (
        <p role="alert" className="mt-3 text-xs text-red-600">
          Elige fechas válidas: el inicio no puede ser posterior al final.
        </p>
      )}
    </section>
  );
}
function MultiSelect({
  label,
  name,
  options,
  selected,
}: {
  label: string;
  name: string;
  options: { id: string; name: string; is_active: boolean }[];
  selected: string[];
}) {
  const [checked, setChecked] = useState(selected);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    const closeOutside = (event: Event) => {
      if (event.target instanceof Node && !details.contains(event.target))
        details.open = false;
    };
    // pointerdown cubre ratón y pantalla táctil sin impedir el clic de destino.
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("focusin", closeOutside);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("focusin", closeOutside);
    };
  }, []);

  return (
    <details
      ref={detailsRef}
      className="group/filter relative min-w-40 max-sm:w-full"
      onKeyDown={(event) => {
        if (event.key === "Escape" && event.currentTarget.open) {
          event.preventDefault();
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary className="field flex list-none items-center justify-between gap-3 text-slate-600 [&::-webkit-details-marker]:hidden dark:text-slate-300">
        {label}: {checked.length || "todas"}
        <Icon
          name="chevron-down"
          size={16}
          className="shrink-0 text-slate-400 transition-transform group-open/filter:rotate-180"
        />
      </summary>
      <div className="absolute top-full right-0 z-20 mt-2 max-h-80 w-full overflow-auto rounded-xl border border-blue-100 bg-white p-2 shadow-xl sm:w-64 dark:border-slate-700 dark:bg-slate-900">
        <label className="mb-1 flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-blue-50 px-3 text-sm font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
          <input
            type="checkbox"
            aria-label={"Todas las " + label.toLowerCase()}
            checked={checked.length === 0}
            onChange={() => setChecked([])}
            className="size-4 accent-blue-600"
          />
          Todas las {label.toLowerCase()}
        </label>
        <p className="mb-2 px-3 text-[10px] text-slate-400">
          Todas elimina la selección de este filtro.
        </p>
        {options.map((o) => (
          <label
            key={o.id}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm hover:bg-blue-50 dark:hover:bg-slate-800"
          >
            <input
              type="checkbox"
              name={name}
              value={o.id}
              checked={checked.includes(o.id)}
              onChange={(e) =>
                setChecked(
                  e.target.checked
                    ? [...checked, o.id]
                    : checked.filter((id) => id !== o.id),
                )
              }
              className="size-4 accent-blue-600"
            />
            {o.name}
            {!o.is_active && (
              <span className="text-xs text-slate-400">inactiva</span>
            )}
          </label>
        ))}
      </div>
    </details>
  );
}
