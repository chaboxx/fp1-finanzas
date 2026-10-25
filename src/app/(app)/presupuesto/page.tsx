import { FormModal } from "@/components/form-modal";
import { BudgetBreakdown } from "@/components/budget-breakdown";
import { Suspense } from "react";
import { PageHeader, Card, LoadingPanel } from "@/components/ui";
import { MonthNav } from "@/components/month-nav";
import { StatCard } from "@/components/stat-card";
import { BudgetSnapshot } from "@/components/budget-snapshot";
import { requireUser } from "@/lib/auth";
import {
  generateDue,
  getBudgetData,
  getCatalogs,
  getReportRows,
} from "@/lib/finance-data";
import { byCategory, summarize } from "@/lib/dashboard";
import {
  currentMonth,
  isMonth,
  monthRange,
  shiftMonth,
  todayISO,
} from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { BudgetForm } from "./budget-form";
export default function BudgetPage({
  searchParams,
}: PageProps<"/presupuesto">) {
  return (
    <>
      <PageHeader
        title="Un plan para tu dinero"
        description="Define tu mes, reparte tus prioridades y comprueba cómo vas."
      />
      <Suspense fallback={<LoadingPanel />}>
        <BudgetContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
async function BudgetContent({
  searchParams,
}: {
  searchParams: PageProps<"/presupuesto">["searchParams"];
}) {
  const { supabase, userId } = await requireUser(),
    params = await searchParams,
    month = isMonth(params.mes) ? params.mes : currentMonth(),
    range = monthRange(month);
  await generateDue(supabase);
  const [budget, previous, catalogs, allRows] = await Promise.all([
    getBudgetData(supabase, month),
    getBudgetData(supabase, shiftMonth(month, -1)),
    getCatalogs(supabase, userId),
    // El presupuesto está en soles: los gastos en dólares no lo consumen.
    getReportRows(supabase, range.from, range.to, "PEN"),
  ]);
  const rows = allRows.filter((r) => r.occurred_on <= todayISO()),
    totals = summarize(rows),
    spent = Object.fromEntries(byCategory(rows).map((r) => [r.id, r.cents]));
  return (
    <>
      <MonthNav month={month} path="/presupuesto" />
      {catalogs.accounts.some((a) => a.currency !== "PEN") && (
        <p className="mb-4 text-xs text-slate-400">
          El presupuesto es en soles: tus gastos y aportes en dólares no lo
          consumen.
        </p>
      )}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          tone="balance"
          label="Total previsto"
          value={budget.plan?.total_cents ?? 0}
          icon="budget"
          emphasis
        />
        <StatCard
          tone="expense"
          label="Egresos ejecutados"
          value={totals.outflow}
          icon="list"
          footnote="Gastos + aportes a inversiones"
        />
        <StatCard
          tone="income"
          label="Ingresos reales"
          value={totals.income}
          icon="arrow"
          footnote="Se comparan con lo previsto; no alteran tus límites"
        />
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <div className="flex justify-end">
            <FormModal
              title="Distribuir presupuesto mensual"
              triggerLabel={
                budget.plan ? "Editar presupuesto" : "Crear presupuesto"
              }
            >
              <BudgetForm
                key={month + budget.plan?.updated_at}
                month={month}
                categories={catalogs.categories}
                budget={budget}
                previous={previous}
                spent={spent}
              />
            </FormModal>
          </div>
          <BudgetBreakdown budget={budget} />
        </div>
        <div className="space-y-6 xl:sticky xl:top-6">
          <BudgetSnapshot
            month={month}
            budget={budget}
            income={totals.income}
            outflow={totals.outflow}
          />
          <Card>
            <h2 className="mb-3 text-sm font-semibold">
              Sin presupuesto asignado
            </h2>
            {byCategory(rows)
              .filter(
                (c) => !budget.allocations.some((a) => a.category_id === c.id),
              )
              .map((c) => (
                <p
                  key={c.id}
                  className="my-3 flex justify-between gap-2 text-xs text-slate-500"
                >
                  <span>{c.name}</span>
                  <strong>{formatCents(c.cents)}</strong>
                </p>
              ))}
            {!byCategory(rows).some(
              (c) => !budget.allocations.some((a) => a.category_id === c.id),
            ) && (
              <p className="muted text-xs">
                No hay egresos fuera de tus asignaciones.
              </p>
            )}
          </Card>
          {budget.legacy.length > 0 && (
            <Card>
              <details>
                <summary className="text-xs font-semibold">
                  Presupuestos anteriores conservados
                </summary>
                <p className="muted my-3 text-xs">
                  Estos montos fijos siguen guardados. El plan por porcentajes
                  se define de forma independiente, sin convertir tus importes
                  anteriores.
                </p>
                {budget.legacy.map((r) => (
                  <p
                    key={r.budget_id}
                    className="my-2 flex justify-between text-xs"
                  >
                    <span>{r.category_name}</span>
                    <strong>{formatCents(Number(r.budget_cents))}</strong>
                  </p>
                ))}
              </details>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
