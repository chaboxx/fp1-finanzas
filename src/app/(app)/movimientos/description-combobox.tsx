"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCents } from "@/lib/money";
import type { TransactionType } from "@/lib/types";

export type Suggestion = {
  description: string;
  type: TransactionType;
  category_id: string | null;
  account_id: string | null;
  amount_cents: number;
  uses: number;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  onPick: (suggestion: Suggestion) => void;
  type: TransactionType;
  categoryName: (id: string | null) => string | undefined;
};

// Campo de descripción con sugerencias de lo que más registras.
// Consulta directo desde el navegador: es seguro porque RLS solo devuelve tus filas.
export function DescriptionCombobox({ value, onChange, onPick, type, categoryName }: Props) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [highlighted, setHighlighted] = useState(-1);
  const listId = useId();
  const requestId = useRef(0);

  useEffect(() => {
    if (!open) return;
    const current = ++requestId.current;
    // Espera 200 ms sin teclear antes de consultar (debounce).
    const timer = setTimeout(async () => {
      const { data } = await createClient().rpc("suggest_descriptions", { p_query: value.trim(), p_limit: 12 });
      // Ignora respuestas de consultas viejas que lleguen tarde.
      if (current !== requestId.current) return;
      const matches = ((data ?? []) as Suggestion[])
        .filter((s) => s.type === type && s.description.toLowerCase() !== value.trim().toLowerCase())
        .slice(0, 6);
      setSuggestions(matches);
      setHighlighted(-1);
    }, 200);
    return () => clearTimeout(timer);
  }, [value, type, open]);

  const visible = open && suggestions.length > 0;

  function pick(s: Suggestion) {
    onPick(s);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!visible) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      pick(suggestions[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor="description" className="text-sm font-medium">
        Descripción
      </label>
      <input
        id="description"
        name="description"
        role="combobox"
        aria-expanded={visible}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={highlighted >= 0 ? `${listId}-${highlighted}` : undefined}
        autoComplete="off"
        maxLength={140}
        placeholder={type === "income" ? "Sueldo" : type === "transfer" ? "Pago de tarjeta" : "Almuerzo"}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 dark:border-zinc-700 dark:bg-zinc-900"
      />
      {visible && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full z-20 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.description}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === highlighted}
              // mousedown en vez de click: se dispara antes del blur que cierra la lista.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm aria-selected:bg-emerald-50 hover:bg-zinc-50 dark:aria-selected:bg-emerald-950 dark:hover:bg-zinc-800"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{s.description}</span>
                <span className="block truncate text-xs text-zinc-500">
                  {[categoryName(s.category_id), `${s.uses} ${s.uses === 1 ? "vez" : "veces"}`].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-400">{formatCents(Number(s.amount_cents))}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
