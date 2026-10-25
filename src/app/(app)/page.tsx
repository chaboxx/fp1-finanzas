import { Suspense } from "react";
import { PageHeader, LoadingPanel } from "@/components/ui";
import { StatCard } from "@/components/stat-card";
import { BudgetSnapshot } from "@/components/budget-snapshot";
import { requireUser } from "@/lib/auth";
import {
  generateDue,
  getBudgetData,
  getCatalogs,
  getReportRows,
} from "@/lib/finance-data";
import {
  change,
  addDays,
  inRange,
  resolvePeriod,
  summarize,
  values,
  type Params,
} from "@/lib/dashboard";
import { todayISO, monthRange, formatMonth } from "@/lib/dates";
import { DashboardFilters } from "./_dashboard/filters";
import { ReportExplorer } from "./_dashboard/explorer";
import {
  CURRENCIES,
  CURRENCY_LABEL,
  formatCents,
  type Currency,
} from "@/lib/money";
import type { DashboardRow } from "@/lib/dashboard";
export default function DashboardPage({ searchParams }: PageProps<"/">) {
  return (
    <>
      <PageHeader
        title="Tu dinero, con claridad"
        description="Mira dónde estás, entiende tus hábitos y decide tu siguiente paso."
      />
      <Suspense fallback={<LoadingPanel />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </>
  );
}
async function Dashboard({ searchParams }: { searchParams: Promise<Params> }) {
  const { supabase, userId } = await requireUser(),
    params = await searchParams,
    today = todayISO(),
    period = resolvePeriod(params, today);
  const month =
      period.key === "mes" ? period.from.slice(0, 7) : today.slice(0, 7),
    range = monthRange(month);
  await generateDue(supabase);
  const [catalogs, rows, budget, budgetRows] = await Promise.all([
    getCatalogs(supabase, userId),
    getReportRows(
      supabase,
      period.prevFrom < period.from ? period.prevFrom : period.from,
      period.to,
    ),
    getBudgetData(supabase, month),
    // Presupuesto y lectura del mes están en soles.
    getReportRows(supabase, range.from, range.to, "PEN"),
  ]);
  const accounts = values(params, "cuenta"),
    categories = values(params, "categoria");
  const scoped = rows.filter(
    (r) => !accounts.length || accounts.includes(r.account_id ?? ""),
  );
  const current = inRange(scoped, period.from, period.plotTo),
    previous = inRange(scoped, period.prevFrom, period.prevTo),
    monthly = summarize(budgetRows.filter((r) => r.occurred_on <= today));
  // Soles y dólares no se suman: cada moneda con cuentas tiene sus tarjetas y su gráfico.
  const currencies = CURRENCIES.filter(
    (c) => c === "PEN" || catalogs.accounts.some((a) => a.currency === c),
  );
  const byCurrency = (list: DashboardRow[], c: Currency) =>
    list.filter((r) => (r.currency ?? "PEN") === c);
  const inCategories = (list: DashboardRow[]) =>
    list.filter(
      (r) => !categories.length || categories.includes(r.category_id),
    );
  const multi = currencies.length > 1;
  return (
    <>
      <DashboardFilters
        key={"filters-" + JSON.stringify(params)}
        params={params}
        period={period}
        {...catalogs}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-400">
          {period.label} ·{" "}
          {accounts.length ? "cuentas seleccionadas" : "todas las cuentas"} ·
          sin filtrar categorías
        </p>
        <span className="text-[11px] text-slate-400">
          {period.prevTo > period.prevFrom
            ? "Comparado con " +
              period.prevFrom +
              " al " +
              addDays(period.prevTo, -1)
            : "Sin días ejecutados para comparar"}
        </span>
      </div>
      {currencies.map((c) => (
        <PeriodCards
          key={c}
          currency={c}
          heading={multi ? "En " + CURRENCY_LABEL[c].toLowerCase() : undefined}
          now={summarize(byCurrency(current, c))}
          before={summarize(byCurrency(previous, c))}
        />
      ))}
      <div className="space-y-6">
        {currencies.map((c) => (
          <ReportExplorer
            key={"explorer-" + c + JSON.stringify(params)}
            rows={inCategories(byCurrency(current, c))}
            previous={inCategories(byCurrency(previous, c))}
            period={period}
            params={params}
            currency={c}
            showCurrency={multi}
          />
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <BudgetSnapshot
          budget={budget}
          month={month}
          income={monthly.income}
          outflow={monthly.outflow}
        />
        <section className="panel">
          <p className="eyebrow mb-2">Lectura rápida</p>
          <h2 className="mb-5 font-semibold">
            Así va {formatMonth(month).toLowerCase()}
            {multi && " · en soles"}
          </h2>
          <div className="space-y-4 text-sm">
            <p className="flex justify-between gap-3 text-slate-500">
              Ingresos registrados
              <strong className="text-slate-800 tabular-nums dark:text-slate-200">
                {formatCents(monthly.income)}
              </strong>
            </p>
            <p className="flex justify-between gap-3 text-slate-500">
              Gastos y aportes
              <strong className="text-slate-800 tabular-nums dark:text-slate-200">
                {formatCents(monthly.outflow)}
              </strong>
            </p>
            <p className="flex justify-between gap-3 border-t border-slate-100 pt-4 text-slate-500 dark:border-slate-800">
              Proporción de ingresos utilizada
              <strong className="text-slate-800 dark:text-slate-200">
                {monthly.income
                  ? ((monthly.outflow / monthly.income) * 100).toFixed(1) + " %"
                  : "Aún no hay ingresos"}
              </strong>
            </p>
          </div>
          <p className="mt-5 text-xs leading-relaxed text-slate-400">
            El resultado del período es distinto al saldo de tus cuentas.
            Consulta Cuentas para ver tu dinero y tu deuda actuales.
          </p>
        </section>
      </div>
    </>
  );
}

function PeriodCards({
  currency,
  heading,
  now,
  before,
}: {
  currency: Currency;
  heading?: string;
  now: ReturnType<typeof summarize>;
  before: ReturnType<typeof summarize>;
}) {
  return (
    <section className="mb-6">
      {heading && <h2 className="eyebrow mb-2">{heading}</h2>}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard
          tone="income"
          label="Ingresos"
          value={now.income}
          currency={currency}
          icon="arrow"
          delta={change(now.income, before.income)}
        />
        <StatCard
          tone="expense"
          label="Gastos"
          value={now.expense}
          currency={currency}
          icon="wallet"
          delta={change(now.expense, before.expense)}
        />
        <StatCard
          tone="investment"
          label="Aportes a inversiones"
          value={now.invested}
          currency={currency}
          icon="trend"
          delta={change(now.invested, before.invested)}
        />
        <StatCard
          tone="expense"
          label="Egresos totales"
          value={now.outflow}
          currency={currency}
          icon="list"
          footnote="Gastos + aportes; sin transferencias"
        />
        <StatCard
          tone="balance"
          label="Resultado del período"
          value={now.balance}
          currency={currency}
          emphasis
          icon="budget"
          footnote={
            now.divested
              ? "Incluye " +
                formatCents(now.divested, currency) +
                " en rescates"
              : "Ingresos − gastos − aportes"
          }
        />
      </div>
    </section>
  );
}
