import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import {
  change,
  inRange,
  OTHER_ID,
  outflowByCategory,
  outflowTrend,
  resolvePeriod,
  summarize,
  topWithOther,
  type DashboardRow,
} from "@/lib/dashboard";
import { withDistinctColors } from "@/lib/colors";
import { todayISO } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { CategoryDonut, CategoryDot, TrendChart } from "./_dashboard/charts";
import { DashboardFilters } from "./_dashboard/filters";

export default function DashboardPage({ searchParams }: PageProps<"/">) {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Resumen</h1>
      <Suspense fallback={<div className="h-[32rem] animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { supabase } = await requireUser();
  const params = await searchParams;
  const period = resolvePeriod(params, todayISO());
  const categoria = typeof params.categoria === "string" ? params.categoria : "";
  const cuenta = typeof params.cuenta === "string" ? params.cuenta : "";

  // Un solo viaje a la base: período actual + período anterior (para comparar).
  let query = supabase
    .from("categorized_movements")
    .select("type, amount_cents, occurred_on, category_id, category_name, category_color, category_is_active")
    .in("type", ["expense", "income", "invest"])
    .gte("occurred_on", period.prevFrom < period.from ? period.prevFrom : period.from)
    .lt("occurred_on", period.to);
  if (categoria) query = query.eq("category_id", categoria);
  if (cuenta) query = query.eq("account_id", cuenta);

  const [movements, categories, accounts] = await Promise.all([
    query,
    supabase.from("categories").select("id, name, is_active").neq("kind", "income").order("name"),
    supabase.from("accounts").select("id, name, is_active").order("created_at"),
  ]);
  if (movements.error) throw new Error("No se pudo cargar el resumen");

  const rows = (movements.data as DashboardRow[]).map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }));
  const current = inRange(rows, period.from, period.to);
  const previous = inRange(rows, period.prevFrom, period.prevTo);
  const now = summarize(current);
  const before = summarize(previous);

  const slices = outflowByCategory(current);
  // Los colores se resuelven una sola vez: una categoría tiene el mismo color en todos los gráficos.
  const donutSlices = withDistinctColors(topWithOther(slices, 7)); // máx. 8 colores
  const donutColor = new Map(donutSlices.map((s) => [s.id, s.color]));
  const lineSeries = topWithOther(slices, 4).map((s) => ({ ...s, color: donutColor.get(s.id) ?? s.color }));
  const trend = outflowTrend(current, period, lineSeries.map((s) => s.id));
  const dailyAverage = period.elapsedDays ? Math.round(now.outflow / period.elapsedDays) : 0;
  const spentShare = now.income ? (now.outflow / now.income) * 100 : null;

  const filters = (
    <DashboardFilters
      periodo={period.key}
      mes={period.key === "mes" ? period.from.slice(0, 7) : todayISO().slice(0, 7)}
      desde={typeof params.desde === "string" ? params.desde : ""}
      hasta={typeof params.hasta === "string" ? params.hasta : ""}
      categoria={categoria}
      cuenta={cuenta}
      categories={categories.data ?? []}
      accounts={accounts.data ?? []}
    />
  );

  if (current.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {filters}
        <Card>
          <p className="text-sm text-zinc-500">
            No hay movimientos en {period.label.toLowerCase()} con estos filtros.{" "}
            <Link href="/movimientos/nuevo" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              Registrar un movimiento
            </Link>
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {filters}

      <p className="-mb-2 text-sm text-zinc-500">
        {period.label} · comparado con los mismos {period.elapsedDays} días del período anterior
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Ingresos" cents={now.income} delta={change(now.income, before.income)} goodWhenUp />
        <StatCard
          label="Gastos"
          cents={now.expense}
          delta={change(now.expense, before.expense)}
          footnote={`Promedio diario de egresos: ${formatCents(dailyAverage)}`}
        />
        <StatCard label="Inversión" cents={now.invested} delta={change(now.invested, before.invested)} goodWhenUp />
        <StatCard
          label="Balance"
          cents={now.balance}
          footnote={spentShare === null ? undefined : `Usaste el ${spentShare.toFixed(0)}% de tus ingresos`}
          negative={now.balance < 0}
        />
      </div>

      <Card>
        <TrendChart
          data={trend}
          granularity={period.granularity}
          series={lineSeries.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
        />
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold">Egresos por categoría</h2>
        <div className="grid items-center gap-6 md:grid-cols-[15rem_1fr]">
          <CategoryDonut slices={donutSlices} total={now.outflow} />
          {/* Tabla: los mismos datos del gráfico, accesibles sin pasar el mouse. */}
          <table className="w-full text-sm">
            <caption className="sr-only">Egresos por categoría</caption>
            <thead className="sr-only">
              <tr>
                <th>Categoría</th>
                <th>Monto</th>
                <th>Porcentaje</th>
              </tr>
            </thead>
            <tbody>
              {slices.map((s) => (
                <tr key={s.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="py-2 pr-2">
                    <Link
                      href={categoryHref(params, s.id)}
                      className="flex items-center gap-2 hover:underline"
                      title="Filtrar por esta categoría"
                    >
                      <CategoryDot color={donutColor.get(s.id) ?? s.color} />
                      <span className="truncate">{s.name}</span>
                      {!s.isActive && <span className="text-xs text-zinc-400">(deshabilitada)</span>}
                    </Link>
                  </td>
                  <td className="py-2 text-right font-medium tabular-nums">{formatCents(s.cents)}</td>
                  <td className="w-16 py-2 text-right text-zinc-500 tabular-nums">{s.pct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function categoryHref(params: Record<string, string | string[] | undefined>, categoryId: string) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (typeof v === "string" && v) next.set(k, v);
  if (categoryId !== OTHER_ID) next.set("categoria", categoryId);
  return `/?${next}`;
}

type StatCardProps = {
  label: string;
  cents: number;
  delta?: number | null;
  goodWhenUp?: boolean;
  footnote?: string;
  negative?: boolean;
};

function StatCard({ label, cents, delta, goodWhenUp = false, footnote, negative = false }: StatCardProps) {
  // Subir es bueno en ingresos e inversión, malo en gastos. Flecha + texto: no solo color.
  const good = delta == null ? null : goodWhenUp ? delta >= 0 : delta <= 0;
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className={`text-xl font-semibold tabular-nums sm:text-2xl ${negative ? "text-red-600 dark:text-red-400" : ""}`}>
        {formatCents(cents)}
      </p>
      {delta != null && (
        <p className={`text-xs font-medium ${good ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}% vs. período anterior
        </p>
      )}
      {footnote && <p className="text-xs text-zinc-500">{footnote}</p>}
    </Card>
  );
}
