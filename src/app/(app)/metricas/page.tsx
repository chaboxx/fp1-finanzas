import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, LoadingPanel, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { addMonths } from "@/lib/dashboard";
import { currentMonth, isMonth, todayISO } from "@/lib/dates";
import { fetchAll, generateDue, getBudgetData, getReportRows } from "@/lib/finance-data";
import {
  averageMonthlyExpense,
  budgetMetric,
  categoryChanges,
  emergencyMetric,
  evaluateHistory,
  investmentMetric,
  monthContext,
  projectMonth,
  savingsMetric,
  streak,
  targetsFor,
  upcomingOccurrences,
  type MonthSummary,
} from "@/lib/metrics";
import { recurrenceDate } from "@/lib/recurrence";
import { MetricsView } from "./metrics-view";

export const metadata: Metadata = { title: "Métricas · Finanzas" };

export default function MetricsPage({ searchParams }: PageProps<"/metricas">) {
  return (
    <>
      <PageHeader title="¿Vas por buen camino?" description="Tu avance del mes frente a tus metas, y lo que cambió respecto a tus meses anteriores." />
      <Suspense fallback={<LoadingPanel />}>
        <Metrics searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Metrics({ searchParams }: { searchParams: PageProps<"/metricas">["searchParams"] }) {
  const { supabase } = await requireUser();
  const params = await searchParams;
  const today = todayISO();
  const month = isMonth(params.mes) ? params.mes : currentMonth();
  const ctx = monthContext(month, today);
  await generateDue(supabase); // los recurrentes vencidos deben existir antes de medir

  // Si la migración de métricas aún no está aplicada en Supabase, se explica en vez de fallar.
  const [targetsCheck, accountsCheck] = await Promise.all([
    supabase.from("financial_targets").select("id").limit(1),
    supabase.from("accounts").select("in_emergency_fund").limit(1),
  ]);
  if (targetsCheck.error || accountsCheck.error) return <MigrationNotice />;

  const [rows, recurringRows, rules, budget, summary, balances, allAccounts, targetRows] = await Promise.all([
    // Mes evaluado + 3 meses anteriores (para comparar).
    // Métricas, metas y presupuesto están en soles: los dólares se ven en Resumen.
    getReportRows(supabase, addMonths(ctx.from, -3), ctx.to, "PEN"),
    fetchAll((a, b) =>
      supabase
        .from("transactions")
        .select("id, type, amount_cents, occurred_on")
        .not("recurring_rule_id", "is", null)
        .gte("occurred_on", ctx.from)
        .lte("occurred_on", today)
        .order("id")
        .range(a, b),
    ),
    fetchAll((a, b) =>
      supabase
        .from("recurring_rules")
        .select("id, type, amount_cents, start_on, end_on, frequency, occurrence_index, is_active")
        .eq("is_active", true)
        .order("id")
        .range(a, b),
    ),
    getBudgetData(supabase, month),
    supabase.from("monthly_summary").select("*").eq("currency", "PEN").gte("month", addMonths(ctx.from, -12)).lte("month", ctx.from),
    fetchAll((a, b) => supabase.from("account_balances").select("account_id, balance_cents").order("account_id").range(a, b)),
    fetchAll((a, b) =>
      supabase.from("accounts").select("id, name, type, is_active, in_emergency_fund, currency").order("created_at").order("id").range(a, b),
    ),
    fetchAll((a, b) => supabase.from("financial_targets").select("*").order("effective_month").range(a, b)),
  ]);
  if (summary.error) throw new Error("No se pudo cargar el historial mensual");
  const accounts = allAccounts.filter((a) => a.currency === "PEN");
  const hasUsd = allAccounts.length > accounts.length;

  const targets = targetsFor(month, targetRows);
  const monthRows = rows.filter((r) => r.occurred_on >= ctx.from && r.occurred_on < ctx.to);
  const recurring = recurringRows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }));
  const projection = projectMonth(monthRows, recurring, upcomingOccurrences(rules, ctx, recurrenceDate), ctx);

  const history: MonthSummary[] = (summary.data ?? []).map((m) => ({
    month: (m.month ?? "").slice(0, 7),
    income: Number(m.income_cents ?? 0),
    expense: Number(m.expense_cents ?? 0),
    invested: Number(m.invested_cents ?? 0),
    divested: Number(m.divested_cents ?? 0),
  }));
  const results = evaluateHistory(history, targetRows);

  const exceeded = budget.allocations.filter((a) => Number(a.spent_cents) > Number(a.budget_cents)).length;
  const savings = savingsMetric(projection, targets);
  const budgetM = budgetMetric(projection, budget.plan ? Number(budget.plan.total_cents) : null, ctx, exceeded);
  const investment = investmentMetric(projection, targets, ctx);

  // El fondo de emergencia es una foto de hoy, sin importar el mes que se mire.
  const balanceById = new Map(balances.map((b) => [b.account_id, Number(b.balance_cents ?? 0)]));
  const liquid = accounts
    .filter((a) => a.is_active && a.type !== "credit" && a.in_emergency_fund)
    .reduce((s, a) => s + Math.max(balanceById.get(a.id) ?? 0, 0), 0);
  const emergency = emergencyMetric(liquid, averageMonthlyExpense(history, currentMonth()), targetsFor(currentMonth(), targetRows));

  const changes = categoryChanges(rows, ctx);
  const savingsStreak = streak(results, "savingsMet", currentMonth());
  const investmentStreak = streak(results, "investmentMet", currentMonth());

  return (
    <>
    {hasUsd && (
      <p className="mb-4 text-xs text-slate-400">
        Las métricas, metas y el fondo de emergencia se calculan en soles. Tus movimientos en dólares están en Resumen y Movimientos.
      </p>
    )}
    <MetricsView
      month={month}
      ctx={ctx}
      projection={projection}
      savings={savings}
      budget={budgetM}
      investment={investment}
      emergency={emergency}
      changes={changes}
      results={results}
      savingsStreak={savingsStreak}
      investmentStreak={investmentStreak}
      targets={targets}
      accounts={accounts}
      currentMonth={currentMonth()}
    />
    </>
  );
}


function MigrationNotice() {
  return (
    <Card className="mx-auto max-w-xl text-center">
      <h2 className="font-semibold">Falta un paso para ver tus métricas</h2>
      <p className="muted mt-2">
        Ejecuta en el SQL Editor de Supabase la migración <code>20261029000000_financial_targets.sql</code> (carpeta{" "}
        <code>supabase/migrations</code>) y vuelve a abrir esta pestaña.
      </p>
    </Card>
  );
}
