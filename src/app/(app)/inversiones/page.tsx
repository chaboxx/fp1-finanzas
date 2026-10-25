import { FormModal, RouteModal } from "@/components/form-modal";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, Card, LoadingPanel, Badge } from "@/components/ui";
import { StatCard } from "@/components/stat-card";
import { requireUser } from "@/lib/auth";
import { fetchAll, getCatalogs, getReportRows } from "@/lib/finance-data";
import { addDays, inRange, resolvePeriod, summarize } from "@/lib/dashboard";
import { todayISO } from "@/lib/dates";
import {
  CURRENCIES,
  CURRENCY_LABEL,
  formatCents,
  type Currency,
} from "@/lib/money";
import { investmentResult } from "@/lib/investments";
import { InvestmentForm, InvestmentSettings } from "./investment-form";
import { CategoriesManager } from "../categorias/categories-ui";
import { DashboardFilters } from "../_dashboard/filters";
import { ReportExplorer } from "../_dashboard/explorer";
import { TrendChart } from "../_dashboard/charts";
import { DeleteMovementButton } from "../movimientos/delete-movement-button";
export default function InvestmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <>
      <PageHeader
        title="Haz crecer tu futuro"
        description="Tus aportes, tus inversiones y su evolución, en un solo lugar."
      />
      <Suspense fallback={<LoadingPanel />}>
        <Investments searchParams={searchParams} />
      </Suspense>
    </>
  );
}
async function Investments({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, userId } = await requireUser(),
    raw = await searchParams,
    params = { ...raw, metrica: "invest" },
    today = todayISO(),
    period = resolvePeriod(params, today);
  const [catalogs, investments, transactions, valuations, report] =
    await Promise.all([
      getCatalogs(supabase, userId),
      fetchAll((a, b) =>
        supabase
          .from("investments")
          .select("*")
          .order("created_at")
          .order("id")
          .range(a, b),
      ),
      fetchAll((a, b) =>
        supabase
          .from("transactions")
          .select("*")
          .in("type", ["invest", "divest"])
          .order("occurred_on", { ascending: false })
          .order("id")
          .range(a, b),
      ),
      fetchAll((a, b) =>
        supabase
          .from("investment_valuations")
          .select("*")
          .lte("valued_on", today)
          .order("valued_on")
          .order("id")
          .range(a, b),
      ),
      getReportRows(supabase, period.prevFrom, period.to),
    ]);
  const executed = transactions.filter((t) => t.occurred_on <= today);
  const latest = new Map<string, (typeof valuations)[number]>();
  for (const value of valuations) latest.set(value.investment_id, value);
  // Cada inversión tiene su moneda; los totales nunca suman soles con dólares.
  const currencyOf = new Map(investments.map((i) => [i.id, i.currency]));
  const inCurrency = <T extends { investment_id: string | null }>(
    list: T[],
    c: Currency,
  ) =>
    list.filter((x) => (currencyOf.get(x.investment_id ?? "") ?? "PEN") === c);
  const currencies = CURRENCIES.filter(
    (c) =>
      c === "PEN" ||
      investments.some((i) => i.currency === c) ||
      catalogs.accounts.some((a) => a.currency === c),
  );
  const multi = currencies.length > 1;
  const categories = new Map(catalogs.categories.map((c) => [c.id, c]));
  const edit =
    typeof raw.editar === "string"
      ? transactions.find((t) => t.id === raw.editar)
      : undefined;
  const accountIds = Array.isArray(raw.cuenta)
      ? raw.cuenta
      : raw.cuenta
        ? [raw.cuenta]
        : [],
    categoryIds = Array.isArray(raw.categoria)
      ? raw.categoria
      : raw.categoria
        ? [raw.categoria]
        : [];
  const scoped = report.filter(
    (r) =>
      r.type === "invest" &&
      (!accountIds.length || accountIds.includes(r.account_id ?? "")) &&
      (!categoryIds.length || categoryIds.includes(r.category_id)),
  );
  const valueTrend = (c: Currency) => {
    const own = inCurrency(valuations, c),
      snapshot = new Map<string, number>();
    return [...new Set(own.map((v) => v.valued_on))].map((d) => {
      for (const value of own.filter((v) => v.valued_on === d))
        snapshot.set(value.investment_id, Number(value.value_cents));
      return {
        key: d,
        end: addDays(d, 1),
        label: d,
        total: [...snapshot.values()].reduce((s, v) => s + v, 0),
      };
    });
  };
  return (
    <div className="space-y-6">
      {currencies.map((c) => {
        const totals = summarize(inCurrency(executed, c)),
          known = inCurrency([...latest.values()], c),
          count = investments.filter((i) => i.currency === c).length;
        return (
          <section key={c}>
            {multi && (
              <h2 className="eyebrow mb-2">
                En {CURRENCY_LABEL[c].toLowerCase()}
              </h2>
            )}
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <StatCard
                tone="investment"
                label="Aportes registrados"
                value={totals.invested}
                currency={c}
                icon="trend"
              />
              <StatCard
                tone="income"
                label="Rescates registrados"
                value={totals.divested}
                currency={c}
                icon="arrow"
              />
              <StatCard
                tone="investment"
                label="Aporte neto"
                value={totals.invested - totals.divested}
                currency={c}
                icon="transfer"
              />
              <StatCard
                tone="balance"
                label="Último valor conocido"
                value={known.reduce((s, v) => s + Number(v.value_cents), 0)}
                currency={c}
                emphasis
                icon="wallet"
                footnote={
                  known.length +
                  " de " +
                  count +
                  " inversiones con valorización; consulta sus fechas"
                }
              />
            </div>
          </section>
        );
      })}
      <div className="flex flex-wrap gap-3">
        {(
          [
            ["invest", "Registrar aporte"],
            ["divest", "Registrar rescate"],
            ["valuation", "Actualizar valor"],
            ["opening", "Saldo inicial"],
          ] as const
        ).map(([operation, label]) => (
          <FormModal
            key={operation}
            title={label}
            triggerLabel={label}
            variant={operation === "invest" ? "primary" : "secondary"}
          >
            <InvestmentForm
              {...catalogs}
              investments={investments}
              initialOperation={operation}
            />
          </FormModal>
        ))}
      </div>
      {edit && (
        <RouteModal title="Editar inversión" closeHref="/inversiones">
          <InvestmentForm
            key={edit.id}
            {...catalogs}
            investments={investments}
            editing={edit}
          />
        </RouteModal>
      )}

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Tu cartera</h2>
          <span className="text-xs text-slate-400">
            Historial completo · todas las cuentas
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {investments.map((i) => {
            const moves = executed.filter((t) => t.investment_id === i.id),
              s = summarize(moves),
              value = latest.get(i.id),
              capital = i.initial_capital_cents,
              money = (cents: number) => formatCents(cents, i.currency);
            return (
              <Card key={i.id} className={!i.is_active ? "opacity-65" : ""}>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="mb-1 text-[11px] text-blue-600">
                      {categories.get(i.category_id)?.name}
                    </p>
                    <h3 className="font-semibold">{i.name}</h3>
                    <p className="mt-1 text-xs text-slate-400">
                      {i.platform || "Sin plataforma"}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {i.currency !== "PEN" && (
                      <Badge tone="muted">{CURRENCY_LABEL[i.currency]}</Badge>
                    )}
                    {!i.is_active && <Badge tone="muted">Deshabilitada</Badge>}
                  </div>
                </div>
                <p className="mt-5 text-2xl font-semibold tabular-nums">
                  {value
                    ? money(Number(value.value_cents))
                    : "Sin valor informado"}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {value
                    ? "Valor al " + value.valued_on
                    : "Actualiza su valor para conocer la evolución"}
                </p>
                <div className="mt-5 space-y-2 text-xs text-slate-500">
                  <p className="flex justify-between">
                    <span>Aportes / rescates</span>
                    <span>
                      {money(s.invested)} / {money(s.divested)}
                    </span>
                  </p>
                  <p className="flex justify-between">
                    <span>Capital previo</span>
                    <span>
                      {capital === null ? "No informado" : money(capital)}
                    </span>
                  </p>
                  <p className="flex justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                    <span>
                      {value
                        ? "Resultado al " + value.valued_on
                        : "Resultado monetario"}
                    </span>
                    <strong>
                      {value && capital !== null
                        ? money(investmentResult(value, capital, moves)!)
                        : "Faltan datos"}
                    </strong>
                  </p>
                </div>
                <InvestmentSettings investment={i} />
              </Card>
            );
          })}
          {!investments.length && (
            <Card className="col-span-full py-12 text-center">
              <p className="font-medium">Tu primera inversión empieza aquí</p>
              <p className="muted mt-2">
                Registra un aporte por categoría o incorpora una inversión que
                ya tenías con Saldo inicial.
              </p>
            </Card>
          )}
        </div>
      </div>
      <details className="panel">
        <summary className="text-sm font-semibold">
          Administrar categorías de inversión
        </summary>
        <div className="mt-6">
          <CategoriesManager
            categories={catalogs.categories}
            onlyKind="investment"
          />
        </div>
      </details>
      <div>
        <h2 className="mb-4 text-lg font-semibold">Analiza tus aportes</h2>
        <DashboardFilters
          key={"filters-" + JSON.stringify(params)}
          params={params}
          period={period}
          {...catalogs}
          basePath="/inversiones"
        />
        <div className="space-y-6">
          {currencies.map((c) => {
            const rows = scoped.filter((r) => (r.currency ?? "PEN") === c);
            return (
              <ReportExplorer
                key={"explorer-" + c + JSON.stringify(params)}
                rows={inRange(rows, period.from, period.plotTo)}
                previous={inRange(rows, period.prevFrom, period.prevTo)}
                period={period}
                params={params}
                basePath="/inversiones"
                allowedMetrics={["invest"]}
                currency={c}
                showCurrency={multi}
              />
            );
          })}
        </div>
      </div>
      {currencies.map((c) => {
        const trend = valueTrend(c);
        if (!trend.length) return null;
        return (
          <Card key={c}>
            <h2 className="mb-2 font-semibold">
              Evolución del valor informado
              {multi && " · " + CURRENCY_LABEL[c].toLowerCase()}
            </h2>
            <p className="muted mb-5 text-xs">
              Suma de las últimas valorizaciones conocidas en cada fecha. Puede
              incluir fechas distintas y una cartera incompleta; no es un
              cálculo de rentabilidad.
            </p>
            <TrendChart
              data={trend}
              series={[]}
              granularity="day"
              title="Valor informado"
              disableDetail
              currency={c}
            />
          </Card>
        );
      })}
      <Card>
        <h2 className="mb-4 font-semibold">Aportes y rescates recientes</h2>
        <div className="max-h-96 overflow-auto">
          {transactions.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 border-b border-slate-100 py-4 last:border-0 dark:border-slate-800"
            >
              <div className="min-w-0 flex-1">
                <Link
                  className="text-sm font-medium hover:text-blue-600"
                  href={"/inversiones?editar=" + t.id}
                >
                  {t.description ||
                    investments.find((i) => i.id === t.investment_id)?.name ||
                    "Inversión"}
                </Link>
                <p className="mt-1 text-xs text-slate-400">
                  {t.occurred_on} · {t.type === "invest" ? "Aporte" : "Rescate"}
                  {t.occurred_on > today ? " · futuro" : ""}
                </p>
              </div>
              <strong className="text-sm tabular-nums">
                {t.type === "invest" ? "−" : "+"}
                {formatCents(
                  t.amount_cents,
                  currencyOf.get(t.investment_id ?? ""),
                )}
              </strong>
              <DeleteMovementButton
                id={t.id}
                description={
                  (t.type === "invest" ? "Aporte" : "Rescate") +
                  " · " +
                  formatCents(
                    t.amount_cents,
                    currencyOf.get(t.investment_id ?? ""),
                  ) +
                  " · " +
                  t.occurred_on
                }
              />
            </div>
          ))}
          {!transactions.length && (
            <p className="muted py-6 text-center">
              No hay movimientos de inversión registrados.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
