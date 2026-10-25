import Link from "next/link";
import { FormModal } from "@/components/form-modal";
import { MovementForm } from "./movement-form";
import { Suspense } from "react";
import { PageHeader, Card, Badge, LoadingPanel } from "@/components/ui";
import { StatCard } from "@/components/stat-card";
import { requireUser } from "@/lib/auth";
import { fetchAll, generateDue, getCatalogs } from "@/lib/finance-data";
import { resolvePeriod, summarize, values, type Params } from "@/lib/dashboard";
import { todayISO, formatDayHeading } from "@/lib/dates";
import { CURRENCIES, CURRENCY_LABEL, formatCents } from "@/lib/money";
import { DashboardFilters } from "../_dashboard/filters";
import { DeleteMovementButton } from "./delete-movement-button";
const labels = {
  expense: "Gasto",
  income: "Ingreso",
  transfer: "Transferencia",
  invest: "Aporte a inversión",
  divest: "Rescate",
};
export default function MovementsPage({
  searchParams,
}: PageProps<"/movimientos">) {
  return (
    <>
      <PageHeader
        title="Tu día a día, registrado"
        description="Consulta, encuentra y corrige tus movimientos sin perder el contexto."
        actions={
          <Link href="/movimientos/recurrentes" className="btn btn-secondary">
            Gestionar recurrentes →
          </Link>
        }
      />
      <Suspense fallback={<LoadingPanel />}>
        <Movements searchParams={searchParams} />
      </Suspense>
    </>
  );
}
async function Movements({ searchParams }: { searchParams: Promise<Params> }) {
  const { supabase, userId } = await requireUser(),
    params = await searchParams,
    today = todayISO(),
    period = resolvePeriod(params, today);
  await generateDue(supabase);
  const [catalogs, allRows, investments] = await Promise.all([
    getCatalogs(supabase, userId),
    fetchAll((a, b) =>
      supabase
        .from("transactions")
        .select("*")
        .gte("occurred_on", period.from)
        .lt("occurred_on", period.to)
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id")
        .range(a, b),
    ),
    fetchAll((a, b) =>
      supabase.from("investments").select("*").order("id").range(a, b),
    ),
  ]);
  const accountMap = new Map(catalogs.accounts.map((a) => [a.id, a])),
    categoryMap = new Map(catalogs.categories.map((c) => [c.id, c])),
    investmentMap = new Map(investments.map((i) => [i.id, i]));
  const accountIds = values(params, "cuenta"),
    categoryIds = values(params, "categoria"),
    kind = String(params.tipo ?? ""),
    search = String(params.buscar ?? "")
      .trim()
      .toLocaleLowerCase("es");
  const rows = allRows.filter((r) => {
    const category =
      r.category_id ??
      (r.investment_id
        ? investmentMap.get(r.investment_id)?.category_id
        : null);
    return (
      (!accountIds.length ||
        accountIds.includes(r.account_id) ||
        (r.to_account_id && accountIds.includes(r.to_account_id))) &&
      (!categoryIds.length || (category && categoryIds.includes(category))) &&
      (!kind ||
        (kind === "outflow"
          ? r.type === "expense" || r.type === "invest"
          : r.type === kind)) &&
      (!search ||
        [
          r.description,
          category ? categoryMap.get(category)?.name : "",
          r.investment_id ? investmentMap.get(r.investment_id)?.name : "",
        ].some((v) => v?.toLocaleLowerCase("es").includes(search)))
    );
  });
  const currencyOf = (accountId: string) =>
    accountMap.get(accountId)?.currency ?? "PEN";
  // Un bloque de totales por moneda: soles y dólares no se suman.
  const executed = rows.filter((r) => r.occurred_on <= today);
  const blocks = CURRENCIES.filter(
    (c) => c === "PEN" || executed.some((r) => currencyOf(r.account_id) === c),
  ).map((c) => ({
    currency: c,
    totals: summarize(executed.filter((r) => currencyOf(r.account_id) === c)),
  }));
  const filterParams = {
    ...params,
    metrica:
      kind === "income"
        ? "income"
        : kind === "invest" || kind === "divest"
          ? "invest"
          : "outflow",
  };
  return (
    <>
      <DashboardFilters
        key={JSON.stringify(params)}
        params={filterParams}
        period={period}
        {...catalogs}
        basePath="/movimientos"
      />

      {blocks.map(({ currency, totals }) => (
        <section key={currency} className="mb-6">
          {blocks.length > 1 && (
            <h2 className="eyebrow mb-2">
              En {CURRENCY_LABEL[currency].toLowerCase()}
            </h2>
          )}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard
              tone="income"
              label="Ingresos"
              value={totals.income}
              currency={currency}
              icon="arrow"
            />
            <StatCard
              tone="expense"
              label="Gastos"
              value={totals.expense}
              currency={currency}
              icon="wallet"
            />
            <StatCard
              tone="investment"
              label="Aportes a inversiones"
              value={totals.invested}
              currency={currency}
              icon="trend"
            />
            <StatCard
              tone="balance"
              label="Resultado"
              value={totals.balance}
              currency={currency}
              icon="list"
              footnote="Incluye rescates; excluye transferencias y futuros"
            />
          </div>
        </section>
      ))}
      <form
        action="/movimientos"
        className="panel mb-6 flex flex-wrap items-end gap-3"
      >
        {Object.entries(params)
          .filter(([k]) => !["tipo", "buscar"].includes(k))
          .flatMap(([k, val]) =>
            (Array.isArray(val) ? val : [val]).map((v, i) =>
              v ? <input key={k + i} type="hidden" name={k} value={v} /> : null,
            ),
          )}
        <label className="min-w-48 flex-1 text-xs font-medium text-slate-500">
          Buscar
          <input
            className="field mt-1.5"
            name="buscar"
            defaultValue={String(params.buscar ?? "")}
            placeholder="Descripción, categoría o inversión"
          />
        </label>
        <label className="text-xs font-medium text-slate-500">
          Tipo
          <select name="tipo" className="field mt-1.5" defaultValue={kind}>
            <option value="">Todos</option>
            {Object.entries(labels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
            <option value="outflow">Gastos + aportes</option>
          </select>
        </label>
        <button className="btn btn-primary">Buscar</button>
      </form>
      {!rows.length ? (
        <Card className="py-12 text-center">
          <h2 className="font-semibold">Sin movimientos con estos filtros</h2>
          <p className="muted mt-2">
            Ajusta la búsqueda o registra tu primer movimiento.
          </p>
          <div className="mt-5">
            <FormModal
              title="Nuevo movimiento"
              triggerLabel="Registrar movimiento"
            >
              <MovementForm {...catalogs} />
            </FormModal>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {[...Map.groupBy(rows, (r) => r.occurred_on)].map(([date, items]) => (
            <section key={date}>
              <h2 className="mb-3 flex items-center gap-3 px-1 text-xs font-medium text-slate-400">
                {formatDayHeading(date)}
                {date > today && (
                  <Badge tone="muted">Futuro · fuera de ejecutado</Badge>
                )}
              </h2>
              <Card className="p-0">
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map((r) => {
                    const inv = r.investment_id
                        ? investmentMap.get(r.investment_id)
                        : undefined,
                      cat = categoryMap.get(
                        r.category_id ?? inv?.category_id ?? "",
                      );
                    const link =
                      r.type === "invest" || r.type === "divest"
                        ? "/inversiones?editar=" + r.id
                        : "/movimientos/" + r.id;
                    return (
                      <li
                        key={r.id}
                        className="flex items-center gap-3 px-4 py-4 sm:px-6"
                      >
                        <span
                          className={
                            "flex size-10 shrink-0 items-center justify-center rounded-xl text-lg " +
                            (r.type === "income" || r.type === "divest"
                              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30"
                              : r.type === "invest"
                                ? "bg-blue-50 text-blue-600 dark:bg-blue-950"
                                : "bg-slate-50 text-slate-400 dark:bg-slate-800")
                          }
                        >
                          {r.type === "transfer"
                            ? "⇄"
                            : r.type === "income" || r.type === "divest"
                              ? "↙"
                              : "↗"}
                        </span>
                        <Link href={link} className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {r.description ||
                              inv?.name ||
                              cat?.name ||
                              labels[r.type]}
                          </p>
                          <p className="mt-1 truncate text-[11px] text-slate-400">
                            {labels[r.type]} ·{" "}
                            {r.type === "transfer"
                              ? accountMap.get(r.account_id)?.name +
                                " → " +
                                accountMap.get(r.to_account_id ?? "")?.name
                              : [cat?.name, accountMap.get(r.account_id)?.name]
                                  .filter(Boolean)
                                  .join(" · ")}
                            {cat && !cat.is_active
                              ? " · categoría deshabilitada"
                              : ""}
                            {r.recurring_rule_id ? " · recurrente" : ""}
                          </p>
                        </Link>
                        <strong
                          className={
                            "shrink-0 text-sm tabular-nums " +
                            (r.type === "income" || r.type === "divest"
                              ? "text-emerald-600"
                              : "")
                          }
                        >
                          {r.type === "income" || r.type === "divest"
                            ? "+"
                            : r.type === "transfer"
                              ? ""
                              : "−"}
                          {formatCents(
                            Number(r.amount_cents),
                            currencyOf(r.account_id),
                          )}
                        </strong>
                        <DeleteMovementButton
                          id={r.id}
                          description={
                            (r.description || labels[r.type]) +
                            " · " +
                            formatCents(
                              Number(r.amount_cents),
                              currencyOf(r.account_id),
                            ) +
                            " · " +
                            date
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
