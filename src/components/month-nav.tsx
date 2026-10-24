"use client";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMonth, isMonth, shiftMonth } from "@/lib/dates";
import { DateInput } from "./date-input";

export function MonthNav({ month, path }: { month: string; path: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useOptimistic(
    month,
    (_current, next: string) => next,
  );
  const [pathname, search = ""] = path.split("?");
  function href(value: string) {
    const query = new URLSearchParams(search);
    query.set("mes", value);
    return pathname + "?" + query.toString();
  }
  function navigate(value: string) {
    if (!isMonth(value)) return;
    startTransition(() => {
      setSelected(value);
      router.push(href(value), { scroll: false });
    });
  }
  return (
    <nav
      aria-label="Mes"
      aria-busy={pending}
      className={
        "panel mb-6 flex flex-wrap items-center justify-between gap-3 transition-opacity " +
        (pending ? "opacity-60" : "")
      }
    >
      <Link href={href(shiftMonth(month, -1))} className="btn btn-ghost">
        ‹ Anterior
      </Link>
      <form
        action={pathname}
        onSubmit={(event) => {
          event.preventDefault();
          navigate(selected);
        }}
        className="flex flex-wrap items-center justify-center gap-3"
      >
        {[...new URLSearchParams(search)]
          .filter(([key]) => key !== "mes")
          .map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
        <label htmlFor="selected-month" className="text-sm font-semibold">
          {formatMonth(selected)}
        </label>
        <DateInput
          id="selected-month"
          type="month"
          name="mes"
          value={selected}
          onChange={(event) => navigate(event.target.value)}
          disabled={pending}
          className="field w-auto"
          aria-label="Mes del presupuesto"
        />
        <noscript>
          <button className="btn btn-secondary">Ver mes</button>
        </noscript>
        {pending && (
          <span role="status" className="text-xs text-slate-500">
            Actualizando…
          </span>
        )}
      </form>
      <Link href={href(shiftMonth(month, 1))} className="btn btn-ghost">
        Siguiente ›
      </Link>
    </nav>
  );
}
