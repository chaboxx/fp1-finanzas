import { FormModal } from "@/components/form-modal";
import { BudgetBreakdown } from "@/components/budget-breakdown";
import { MovementForm } from "@/app/(app)/movimientos/movement-form";
import { MovementSearch } from "@/app/(app)/movimientos/movement-search";
import { ProfileForm } from "@/app/(app)/perfil/profile-form";
import { CategoriesManager } from "@/app/(app)/categorias/categories-ui";
// Se copia a una ruta pública temporal solo durante npm run test:ui y se elimina al salir.
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { AppFrame } from "@/components/app-frame";
import { Icon } from "@/components/icons";
import { MonthNav } from "@/components/month-nav";
import { isMonth } from "@/lib/dates";
import { PageHeader, Card } from "@/components/ui";
import { StatCard } from "@/components/stat-card";
import { BudgetSnapshot } from "@/components/budget-snapshot";
import { DashboardFilters } from "@/app/(app)/_dashboard/filters";
import { ReportExplorer } from "@/app/(app)/_dashboard/explorer";
import { BudgetForm } from "@/app/(app)/presupuesto/budget-form";
import { AccountsWorkspace } from "@/app/(app)/cuentas/accounts-ui";
import { InvestmentForm } from "@/app/(app)/inversiones/investment-form";
import { RecurringForm } from "@/app/(app)/movimientos/recurrentes/recurring-ui";
import {
  inRange,
  resolvePeriod,
  summarize,
  values,
  type DashboardRow,
  type Params,
} from "@/lib/dashboard";
import type { BudgetData, DbRow } from "@/lib/finance-data";
import type { Category, AccountWithBalance } from "@/lib/types";
import { CURRENCIES, CURRENCY_LABEL, type Currency } from "@/lib/money";
const id = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const categories: Category[] = [
  {
    id: id(1),
    name: "Comida",
    kind: "expense",
    color: "#2a78d6",
    is_active: true,
  },
  {
    id: id(2),
    name: "Vivienda",
    kind: "expense",
    color: "#eb6834",
    is_active: true,
  },
  {
    id: id(3),
    name: "S&P 500",
    kind: "investment",
    color: "#1baf7a",
    is_active: true,
  },
  {
    id: id(4),
    name: "Sueldo",
    kind: "income",
    color: "#6250d6",
    is_active: true,
  },
];
const accounts: AccountWithBalance[] = [
  {
    id: id(10),
    name: "BCP Débito",
    type: "debit",
    is_active: true,
    currency: "PEN",
    initial_balance_cents: 0,
    balance_cents: 360000,
  },
  {
    id: id(11),
    name: "Efectivo",
    type: "cash",
    is_active: true,
    currency: "PEN",
    initial_balance_cents: 0,
    balance_cents: 35000,
  },
  {
    id: id(12),
    name: "Visa",
    type: "credit",
    is_active: true,
    currency: "PEN",
    initial_balance_cents: 0,
    balance_cents: -18000,
  },
  {
    id: id(13),
    name: "Cuenta anterior",
    type: "savings",
    is_active: false,
    currency: "PEN",
    initial_balance_cents: 0,
    balance_cents: 0,
  },
  {
    id: id(14),
    name: "Interbank Dólares",
    type: "savings",
    is_active: true,
    currency: "USD",
    initial_balance_cents: 0,
    balance_cents: 120000,
  },
];
const rows: DashboardRow[] = [
  ...Array.from({ length: 20 }, (_, i) => ({
    id: id(100 + i),
    type: "expense" as const,
    amount_cents: [6500, 2300, 0, 10500, 3200, 1500, 0, 9300, 2200, 4500][
      i % 10
    ],
    occurred_on: "2026-10-" + String(i + 1).padStart(2, "0"),
    account_id: id(10),
    category_id: id(1),
    category_name: "Comida",
    category_color: "#2a78d6",
    category_is_active: true,
  })),
  {
    id: id(150),
    type: "expense",
    amount_cents: 120000,
    occurred_on: "2026-10-03",
    account_id: id(10),
    category_id: id(2),
    category_name: "Vivienda",
    category_color: "#eb6834",
    category_is_active: true,
  },
  {
    id: id(151),
    type: "invest",
    amount_cents: 100000,
    occurred_on: "2026-10-09",
    account_id: id(10),
    category_id: id(3),
    category_name: "S&P 500",
    category_color: "#1baf7a",
    category_is_active: true,
  },
  {
    id: id(152),
    type: "income",
    amount_cents: 500000,
    occurred_on: "2026-10-01",
    account_id: id(10),
    category_id: id(4),
    category_name: "Sueldo",
    category_color: "#6250d6",
    category_is_active: true,
  },
  // Dólares: un viaje y un aporte, que se muestran aparte de los soles.
  {
    id: id(160),
    type: "expense",
    amount_cents: 10000,
    occurred_on: "2026-10-12",
    account_id: id(14),
    category_id: id(2),
    category_name: "Vivienda",
    category_color: "#eb6834",
    category_is_active: true,
    currency: "USD",
  },
  {
    id: id(161),
    type: "invest",
    amount_cents: 10000,
    occurred_on: "2026-10-15",
    account_id: id(14),
    category_id: id(3),
    category_name: "S&P 500",
    category_color: "#1baf7a",
    category_is_active: true,
    currency: "USD",
  },
];
const plan: BudgetData["plan"] = {
  id: id(20),
  user_id: id(99),
  month: "2026-10-01",
  total_cents: 500000,
  updated_at: "2026-10-24T12:00:00Z",
};
const budget: BudgetData = {
  plan,
  legacy: [],
  allocations: categories.slice(0, 3).map((c, i) => ({
    id: id(30 + i),
    user_id: id(99),
    plan_id: id(20),
    month: "2026-10-01",
    total_cents: 500000,
    category_id: c.id,
    category_name: c.name,
    category_kind: c.kind,
    category_color: c.color,
    category_is_active: true,
    percentage_bps: [3000, 2400, 2000][i],
    budget_cents: [150000, 120000, 100000][i],
    spent_cents: [160000, 120000, 100000][i],
  })),
};
const investments: DbRow<"investments">[] = [
  {
    id: id(50),
    user_id: id(99),
    category_id: id(3),
    name: "Fondo S&P 500",
    platform: "Mi broker",
    is_active: true,
    created_at: "2026-10-01T12:00:00Z",
    initial_capital_cents: 0,
    opened_on: "2026-10-01",
    request_id: null,
    currency: "PEN",
  },
  {
    id: id(51),
    user_id: id(99),
    category_id: id(3),
    name: "ETF en dólares",
    platform: "Mi broker",
    is_active: true,
    created_at: "2026-10-01T12:00:00Z",
    initial_capital_cents: 0,
    opened_on: "2026-10-01",
    request_id: null,
    currency: "USD",
  },
];
export default function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  return (
    <AppFrame
      quickAction={
        <FormModal
          title="Nuevo movimiento"
          triggerLabel="Nuevo movimiento"
          triggerIcon={<Icon name="plus" />}
          className="size-11 p-0"
        >
          <MovementForm
            accounts={accounts}
            categories={categories}
            defaultAccountId={id(10)}
          />
        </FormModal>
      }
      userMenu={
        <span className="text-xs text-slate-400">Datos de ejemplo</span>
      }
    >
      <div className="mb-6 flex flex-wrap gap-3 text-xs">
        {[
          "resumen",
          "movimientos",
          "metricas",
          "cuentas",
          "inversiones",
          "presupuesto",
          "recurrentes",
        ].map((s) => (
          <Link
            key={s}
            href={"/auth/revision?screen=" + s}
            className="rounded-lg bg-blue-50 px-3 py-2 text-blue-600"
          >
            {s}
          </Link>
        ))}
      </div>
      <Suspense fallback={<div>Cargando revisión…</div>}>
        <Content searchParams={searchParams} />
      </Suspense>
    </AppFrame>
  );
}
async function Content({ searchParams }: { searchParams: Promise<Params> }) {
  await connection();
  const params = await searchParams,
    screen = String(params.screen ?? "resumen");
  if (screen === "movimientos") {
    const search = String(params.buscar ?? "").trim().toLocaleLowerCase("es");
    const kind = String(params.tipo ?? "");
    const matching = rows.filter((row) =>
      (!search || row.category_name.toLocaleLowerCase("es").includes(search)) &&
      (!kind || (kind === "outflow" ? ["expense", "invest"].includes(row.type) : row.type === kind)),
    );
    return (
      <>
        <PageHeader title="Movimientos de ejemplo" />
        <DashboardFilters
          key={"filters-" + JSON.stringify(params)}
          params={params}
          period={resolvePeriod(params, "2026-10-24")}
          accounts={accounts}
          categories={categories}
          basePath="/auth/revision"
        />
        <MovementSearch params={params} action="/auth/revision" />
        <ul aria-label="Resultados de movimientos">
          {matching.map((row) => <li key={row.id}>{row.category_name}</li>)}
        </ul>
      </>
    );
  }
  if (screen === "metricas")
    return <PageHeader title="Métricas de ejemplo" />;
  if (screen === "cuentas")
    return (
      <>
        <PageHeader
          title="Cada cuenta, en orden"
          description="Tu dinero disponible, tus tarjetas y el lugar desde el que pagas."
        />
        <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label="Saldo neto" value={377000} emphasis />
          <StatCard tone="income" label="Dinero en cuentas" value={395000} />
          <StatCard tone="expense" label="Deuda en tarjetas" value={18000} />
          <StatCard tone="income" label="A favor en tarjetas" value={0} />
        </div>
        <AccountsWorkspace accounts={accounts} defaultAccountId={id(10)} />
      </>
    );
  if (screen === "presupuesto")
    return (
      <>
        <PageHeader
          title="Un plan para tu dinero"
          description="Define tu mes, reparte tus prioridades y comprueba cómo vas."
        />
        <MonthNav
          month={isMonth(params.mes) ? params.mes : "2026-10"}
          path="/auth/revision?screen=presupuesto"
        />
        <div className="grid items-start gap-6 xl:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            <FormModal
              title="Distribuir presupuesto mensual"
              triggerLabel="Editar presupuesto"
            >
              {" "}
              <BudgetForm
                month="2026-10"
                categories={categories}
                budget={budget}
                previous={budget}
                spent={{ [id(1)]: 160000, [id(2)]: 120000, [id(3)]: 100000 }}
              />
            </FormModal>
            <BudgetBreakdown budget={budget} />
          </div>
          <BudgetSnapshot
            budget={budget}
            month="2026-10"
            income={500000}
            outflow={380000}
          />
        </div>
      </>
    );
  if (screen === "inversiones")
    return (
      <>
        <PageHeader
          title="Haz crecer tu futuro"
          description="Tus aportes, tus inversiones y su evolución, en un solo lugar."
        />
        <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label="Aportes" value={100000} />
          <StatCard label="Rescates" value={0} />
          <StatCard tone="investment" label="Aporte neto" value={100000} />
          <StatCard
            tone="balance"
            label="Último valor conocido"
            value={105000}
            emphasis
          />
        </div>
        <div className="flex flex-wrap gap-3">
          {(
            [
              ["invest", "Registrar aporte"],
              ["divest", "Registrar rescate"],
              ["valuation", "Actualizar valor"],
              ["opening", "Saldo inicial"],
            ] as const
          ).map(([operation, label]) => (
            <FormModal key={operation} title={label} triggerLabel={label}>
              <InvestmentForm
                accounts={accounts}
                categories={categories}
                investments={investments}
                defaultAccountId={id(10)}
                initialOperation={operation}
              />
            </FormModal>
          ))}
        </div>
      </>
    );
  if (screen === "recurrentes")
    return (
      <>
        <PageHeader title="Lo que se repite, organizado" />
        <RecurringForm
          accounts={accounts}
          categories={categories}
          defaultAccountId={id(10)}
          today="2026-10-24"
        />
      </>
    );
  if (screen === "perfil")
    return (
      <>
        <PageHeader title="Tu perfil" />
        <ProfileForm
          email="usuario@ejemplo.com"
          name="Mi perfil"
          preference="light"
        />
      </>
    );
  if (screen === "categorias")
    return (
      <>
        <PageHeader title="Categorías" />
        <CategoriesManager categories={categories} />
      </>
    );
  const period = resolvePeriod(params, "2026-10-24"),
    accountIds = values(params, "cuenta"),
    categoryIds = values(params, "categoria");
  const current = inRange(rows, period.from, period.plotTo).filter(
    (r) => !accountIds.length || accountIds.includes(r.account_id!),
  );
  const analyzed = current.filter(
    (r) => !categoryIds.length || categoryIds.includes(r.category_id),
  );
  const inCurrency = (list: DashboardRow[], c: Currency) =>
    list.filter((r) => (r.currency ?? "PEN") === c);
  return (
    <>
      <PageHeader
        title="Tu dinero, con claridad"
        description="Mira dónde estás, entiende tus hábitos y decide tu siguiente paso."
      />
      <DashboardFilters
        key={"filters-" + JSON.stringify(params)}
        params={params}
        period={period}
        accounts={accounts}
        categories={categories}
        basePath="/auth/revision"
      />
      {CURRENCIES.map((c) => {
        const stats = summarize(inCurrency(current, c));
        return (
          <section key={c} className="mb-6">
            <h2 className="eyebrow mb-2">
              En {CURRENCY_LABEL[c].toLowerCase()}
            </h2>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
              <StatCard
                tone="income"
                label="Ingresos"
                value={stats.income}
                currency={c}
              />
              <StatCard
                tone="expense"
                label="Gastos"
                value={stats.expense}
                currency={c}
              />
              <StatCard
                tone="investment"
                label="Aportes a inversiones"
                value={stats.invested}
                currency={c}
              />
              <StatCard
                tone="expense"
                label="Egresos totales"
                value={stats.outflow}
                currency={c}
              />
              <StatCard
                tone="balance"
                label="Resultado del período"
                value={stats.balance}
                currency={c}
                emphasis
              />
            </div>
          </section>
        );
      })}
      <div className="space-y-6">
        {CURRENCIES.map((c) => (
          <ReportExplorer
            key={"explorer-" + c + JSON.stringify(params)}
            rows={inCurrency(analyzed, c)}
            previous={[]}
            period={period}
            params={params}
            basePath="/auth/revision"
            currency={c}
            showCurrency
          />
        ))}
      </div>
      <div className="mt-6">
        <BudgetSnapshot
          budget={budget}
          month="2026-10"
          income={500000}
          outflow={380000}
        />
      </div>
      <Card className="mt-6 text-xs text-slate-400">
        Revisión temporal con datos ficticios. No crea ni modifica registros
        reales.
      </Card>
    </>
  );
}
