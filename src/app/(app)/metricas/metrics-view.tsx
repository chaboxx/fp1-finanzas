import Link from "next/link";
import { FormModal } from "@/components/form-modal";
import { MonthNav } from "@/components/month-nav";
import { Card } from "@/components/ui";
import { formatMonth } from "@/lib/dates";
import type {
  BudgetMetric,
  categoryChanges,
  EmergencyMetric,
  InvestmentMetric,
  MonthContext,
  MonthResult,
  Projection,
  SavingsMetric,
  Targets,
} from "@/lib/metrics";
import { formatCents } from "@/lib/money";
import type { AccountType } from "@/lib/types";
import { ChangesSection, HistorySection, IndicatorCard, ProgressBar, percent } from "./metric-ui";
import { TargetsForm } from "./targets-form";

// Vista pura de la pestaña Métricas: recibe todo calculado (ver page.tsx).
export type MetricsViewProps = {
  month: string;
  ctx: MonthContext;
  projection: Projection;
  savings: SavingsMetric;
  budget: BudgetMetric;
  investment: InvestmentMetric;
  emergency: EmergencyMetric;
  changes: ReturnType<typeof categoryChanges>;
  results: MonthResult[];
  savingsStreak: number;
  investmentStreak: number;
  targets: Targets & { effectiveMonth: string | null };
  accounts: { id: string; name: string; type: AccountType; in_emergency_fund: boolean }[];
  currentMonth: string;
};

export function MetricsView({
  month,
  ctx,
  projection,
  savings,
  budget,
  investment,
  emergency,
  changes,
  results,
  savingsStreak,
  investmentStreak,
  targets,
  accounts,
  currentMonth,
}: MetricsViewProps) {
  return (
    <div className="space-y-6">
      <MonthNav month={month} path="/metricas" />

      <p className="muted -mt-2">
        {ctx.closed
          ? `${formatMonth(month)} ya cerró: este es el resultado final.`
          : ctx.future
            ? `${formatMonth(month)} aún no empieza.`
            : `Día ${ctx.elapsedDays} de ${ctx.daysInMonth}. Los estados usan una proyección al cierre del mes: lo ejecutado + lo programado + tu ritmo de gasto variable.`}
        {projection.early && " Es temprano en el mes: la proyección puede cambiar bastante."}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <IndicatorCard
          title="Ahorro"
          question="¿Estoy ahorrando lo que me propuse?"
          status={savings.status}
          closed={ctx.closed}
          value={savings.rate === null ? "—" : percent(savings.rate)}
          valueNote={savings.rate === null ? undefined : ctx.closed ? "de tus ingresos" : "proyectado al cierre"}
        >
          {savings.rate === null ? (
            <p>Aún no hay ingresos este mes. Si tu sueldo es un movimiento recurrente, la proyección lo incluye apenas exista la regla.</p>
          ) : (
            <>
              <ProgressBar value={Math.max(savings.rate, 0)} target={savings.target} label={`Meta ${percent(savings.target)}`} />
              <p>
                {ctx.closed ? "Ahorraste" : "Ahorrarías"} <strong>{formatCents(savings.saved)}</strong> de {formatCents(savings.income)} de
                ingresos. Meta: {percent(savings.target)}.
              </p>
              {savings.investedShare !== null && <p>De lo ahorrado, invertiste el {percent(savings.investedShare)}.</p>}
              {!ctx.closed && (
                <p className="text-xs">
                  Hasta hoy: ingresos {formatCents(projection.income.actual)} · gastos {formatCents(projection.expense.actual)}.
                </p>
              )}
            </>
          )}
          {savingsStreak > 0 && <Streak months={savingsStreak} />}
        </IndicatorCard>

        <IndicatorCard
          title="Presupuesto"
          question="¿Respeto mi presupuesto?"
          status={budget.status}
          closed={ctx.closed}
          value={budget.budget === null ? "—" : percent((ctx.closed ? budget.usedPct : budget.projectedPct) ?? 0)}
          valueNote={budget.budget === null ? undefined : ctx.closed ? "del presupuesto usado" : "proyectado al cierre"}
        >
          {budget.budget === null ? (
            <p>
              No hay presupuesto para {formatMonth(month).toLowerCase()}.{" "}
              <Link href={`/presupuesto?mes=${month}`} className="font-semibold text-blue-600 hover:underline">
                Crear presupuesto
              </Link>
            </p>
          ) : (
            <>
              <ProgressBar
                value={budget.usedPct ?? 0}
                target={1}
                overIsBad
                marker={ctx.closed ? undefined : budget.elapsedPct}
                label={ctx.closed ? "100 %" : `Hoy deberías ir en ${percent(budget.elapsedPct)}`}
              />
              <p>
                Llevas <strong>{formatCents(budget.actual)}</strong> de {formatCents(budget.budget)} ({percent(budget.usedPct ?? 0)})
                {ctx.closed ? "." : ` con el ${percent(budget.elapsedPct)} del mes transcurrido.`}
              </p>
              {!ctx.closed && (
                <p>
                  Al ritmo actual cierras en <strong>{formatCents(budget.projected)}</strong>
                  {budget.projected > budget.budget
                    ? `, ${formatCents(budget.projected - budget.budget)} por encima.`
                    : `, ${formatCents(budget.budget - budget.projected)} por debajo.`}
                </p>
              )}
              {budget.exceededCategories > 0 && (
                <p>
                  {budget.exceededCategories === 1 ? "1 categoría ya superó" : `${budget.exceededCategories} categorías ya superaron`} su
                  límite.{" "}
                  <Link href={`/presupuesto?mes=${month}`} className="font-semibold text-blue-600 hover:underline">
                    Ver detalle
                  </Link>
                </p>
              )}
            </>
          )}
        </IndicatorCard>

        <IndicatorCard
          title="Inversión"
          question="¿Estoy invirtiendo lo que me propuse?"
          status={investment.status}
          closed={ctx.closed}
          value={formatCents(investment.actual)}
          valueNote={investment.target ? `de ${formatCents(investment.target)} este mes` : "aportes netos este mes"}
        >
          {investment.target <= 0 ? (
            <p>Define cuánto quieres invertir cada mes en «Mis metas» para medir tu cumplimiento.</p>
          ) : (
            <>
              <ProgressBar value={Math.max(investment.actual, 0) / investment.target} target={1} label="Meta" />
              {investment.status === "good" ? (
                <p>
                  {investment.actual >= investment.target
                    ? "Meta del mes cumplida."
                    : `Con lo programado (${formatCents(investment.scheduled)}) llegas a la meta.`}
                </p>
              ) : ctx.closed ? (
                <p>Te faltaron {formatCents(investment.missing)} para la meta.</p>
              ) : (
                <p>
                  Faltan <strong>{formatCents(investment.missing)}</strong>; quedan {ctx.remainingDays}{" "}
                  {ctx.remainingDays === 1 ? "día" : "días"}.
                </p>
              )}
              <p className="text-xs">Se mide cuánto aportas (lo que controlas), no el rendimiento del mercado.</p>
            </>
          )}
          {investmentStreak > 0 && <Streak months={investmentStreak} />}
        </IndicatorCard>

        <IndicatorCard
          title="Fondo de emergencia"
          question="¿Aguanto una emergencia?"
          status={emergency.status}
          closed={false}
          value={emergency.months === null ? "—" : `${emergency.months.toFixed(1)} meses`}
          valueNote="a hoy"
        >
          {emergency.months === null ? (
            <p>Necesito al menos un mes completo con gastos para calcular tu gasto mensual de referencia.</p>
          ) : (
            <>
              <ProgressBar value={emergency.months} target={emergency.target} label={`Meta ${emergency.target} meses`} />
              <p>
                <strong>{formatCents(emergency.liquid)}</strong> disponibles cubren {emergency.months.toFixed(1)} meses de tu gasto promedio (
                {formatCents(emergency.monthlyExpense)} al mes).
              </p>
              {emergency.missing > 0 && (
                <p>
                  Para llegar a {emergency.target} meses te faltan {formatCents(emergency.missing)}.
                </p>
              )}
              <p className="text-xs">No descuenta deudas de tarjeta. Las cuentas que cuentan se eligen en «Mis metas».</p>
            </>
          )}
        </IndicatorCard>
      </div>

      <ChangesSection changes={changes} closed={ctx.closed} />

      <HistorySection results={results} currentMonth={currentMonth} savingsStreak={savingsStreak} investmentStreak={investmentStreak} />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Mis metas</h2>
            <p className="muted mt-1">
              {targets.effectiveMonth
                ? `Vigentes desde ${formatMonth(targets.effectiveMonth).toLowerCase()}.`
                : "Aún no defines metas: se usan las sugeridas."}
            </p>
          </div>
          <FormModal title={`Metas desde ${formatMonth(month).toLowerCase()}`} triggerLabel="Editar metas" variant="secondary">
            <TargetsForm month={month} targets={targets} accounts={accounts} />
          </FormModal>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <Target label="Ahorro mínimo" value={percent(targets.savingsRateBps / 10000)} />
          <Target label="Inversión mensual" value={targets.monthlyInvestmentCents ? formatCents(targets.monthlyInvestmentCents) : "Sin meta"} />
          <Target label="Fondo de emergencia" value={`${targets.emergencyMonths} meses de gasto`} />
        </dl>
      </Card>
    </div>
  );
}

function Streak({ months }: { months: number }) {
  return (
    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
      Racha: {months} {months === 1 ? "mes cerrado" : "meses cerrados seguidos"} cumpliendo.
    </p>
  );
}

function Target({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
