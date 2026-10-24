import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { currentMonth, formatDayHeading, formatMonth, isMonth, monthRange, shiftMonth } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import type { TransactionType } from "@/lib/types";
import { DeleteMovementButton } from "./delete-movement-button";

export const metadata: Metadata = { title: "Movimientos · Finanzas" };

export default function MovementsPage({ searchParams }: PageProps<"/movimientos">) {
  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Movimientos</h1>
        <Link
          href="/movimientos/nuevo"
          className="flex h-10 items-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-700"
        >
          + Nuevo
        </Link>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />}>
        <MonthMovements searchParams={searchParams} />
      </Suspense>
    </>
  );
}

type Row = {
  id: string;
  type: TransactionType;
  amount_cents: number;
  occurred_on: string;
  description: string | null;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
};

async function MonthMovements({ searchParams }: { searchParams: PageProps<"/movimientos">["searchParams"] }) {
  // requireUser() va primero: espera al request real antes de leer el reloj (currentMonth).
  const { supabase } = await requireUser();
  const { mes } = await searchParams;
  const month = isMonth(mes) ? mes : currentMonth();
  const { from, to } = monthRange(month);

  // Tres consultas simples y el "join" en memoria: con este volumen es más claro que
  // un select anidado, y no depende de cómo PostgREST resuelva las FKs compuestas.
  const [movements, accounts, categories] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, type, amount_cents, occurred_on, description, account_id, to_account_id, category_id")
      .gte("occurred_on", from)
      .lt("occurred_on", to)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("accounts").select("id, name"),
    supabase.from("categories").select("id, name, color"),
  ]);
  if (movements.error) throw new Error("No se pudieron cargar los movimientos");

  const accountName = new Map((accounts.data ?? []).map((a) => [a.id, a.name as string]));
  const category = new Map((categories.data ?? []).map((c) => [c.id, c as { name: string; color: string | null }]));
  const rows = (movements.data as Row[]).map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }));

  const income = rows.filter((r) => r.type === "income").reduce((s, r) => s + r.amount_cents, 0);
  const expense = rows.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount_cents, 0);

  const byDay = Map.groupBy(rows, (r) => r.occurred_on);

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex items-center justify-between" aria-label="Mes">
        <MonthLink month={shiftMonth(month, -1)} label="‹ Anterior" />
        <h2 className="font-semibold">{formatMonth(month)}</h2>
        {month < currentMonth() ? <MonthLink month={shiftMonth(month, 1)} label="Siguiente ›" /> : <span className="w-20" />}
      </nav>

      <div className="grid grid-cols-3 gap-2">
        <Total label="Ingresos" cents={income} tone="text-emerald-600" />
        <Total label="Gastos" cents={expense} tone="text-red-600" />
        <Total label="Balance" cents={income - expense} tone={income - expense < 0 ? "text-red-600" : ""} />
      </div>

      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-500">No hay movimientos en {formatMonth(month).toLowerCase()}.</p>
        </Card>
      ) : (
        [...byDay].map(([day, items]) => (
          <section key={day}>
            <h3 className="mb-2 px-1 text-sm font-medium text-zinc-500">{formatDayHeading(day)}</h3>
            <Card className="p-0">
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {items.map((r) => {
                  const cat = r.category_id ? category.get(r.category_id) : undefined;
                  const subtitle =
                    r.type === "transfer"
                      ? `${accountName.get(r.account_id)} → ${r.to_account_id ? accountName.get(r.to_account_id) : ""}`
                      : [cat?.name, accountName.get(r.account_id)].filter(Boolean).join(" · ");
                  return (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: r.type === "transfer" ? "#a1a1aa" : (cat?.color ?? "#a1a1aa") }}
                      />
                      <Link href={`/movimientos/${r.id}`} className="min-w-0 flex-1">
                        <p className="truncate font-medium">{r.description || cat?.name || "Transferencia"}</p>
                        <p className="truncate text-xs text-zinc-500">{subtitle}</p>
                      </Link>
                      <Amount type={r.type} cents={r.amount_cents} />
                      <DeleteMovementButton id={r.id} />
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}

function MonthLink({ month, label }: { month: string; label: string }) {
  return (
    <Link href={`/movimientos?mes=${month}`} className="w-20 text-sm font-medium text-emerald-700 hover:underline last:text-right dark:text-emerald-400">
      {label}
    </Link>
  );
}

function Total({ label, cents, tone }: { label: string; cents: number; tone: string }) {
  return (
    <Card className="px-3 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-semibold tabular-nums sm:text-base ${tone}`}>{formatCents(cents)}</p>
    </Card>
  );
}

function Amount({ type, cents }: { type: TransactionType; cents: number }) {
  const sign = type === "income" || type === "divest" ? "+" : type === "transfer" ? "" : "−";
  const tone = type === "income" || type === "divest" ? "text-emerald-600" : type === "transfer" ? "text-zinc-500" : "";
  return (
    <span className={`shrink-0 font-semibold tabular-nums ${tone}`}>
      {sign}
      {formatCents(cents)}
    </span>
  );
}
