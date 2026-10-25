import { Suspense } from "react";
import { PageHeader, LoadingPanel } from "@/components/ui";
import { StatCard } from "@/components/stat-card";
import { requireUser } from "@/lib/auth";
import { fetchAll, generateDue } from "@/lib/finance-data";
import type { AccountWithBalance } from "@/lib/types";
import { currencyParam, type Currency } from "@/lib/money";
import { CurrencyHeading } from "@/components/currency-toggle";
import type { Params } from "@/lib/dashboard";
import { AccountsWorkspace } from "./accounts-ui";
export default function AccountsPage({ searchParams }: PageProps<"/cuentas">) {
  return (
    <>
      <PageHeader
        title="Cada cuenta, en orden"
        description="Tu dinero disponible, tus tarjetas y el lugar desde el que pagas."
      />
      <Suspense fallback={<LoadingPanel />}>
        <Accounts searchParams={searchParams} />
      </Suspense>
    </>
  );
}
async function Accounts({ searchParams }: { searchParams: Promise<Params> }) {
  const { supabase, userId } = await requireUser();
  const params = await searchParams;
  await generateDue(supabase);
  const [rows, balances, profile] = await Promise.all([
    fetchAll((a, b) =>
      supabase
        .from("accounts")
        .select("*")
        .order("created_at")
        .order("id")
        .range(a, b),
    ),
    fetchAll((a, b) =>
      supabase
        .from("account_balances")
        .select("*")
        .order("account_id")
        .range(a, b),
    ),
    supabase
      .from("profiles")
      .select("default_account_id")
      .eq("id", userId)
      .single(),
  ]);
  if (profile.error)
    throw new Error("No se pudo cargar la cuenta predeterminada");
  const balanceMap = new Map(
    balances.map((b) => [b.account_id, Number(b.balance_cents)]),
  );
  const accounts: AccountWithBalance[] = rows.map((a) => ({
    ...a,
    initial_balance_cents: Number(a.initial_balance_cents),
    balance_cents: balanceMap.get(a.id) ?? Number(a.initial_balance_cents),
  }));
  // Soles y dólares nunca se suman: los totales muestran la moneda elegida.
  const multi = accounts.some((a) => a.currency === "USD");
  const currency = multi ? currencyParam(params.moneda) : "PEN";
  return (
    <>
      {multi && (
        <CurrencyHeading
          params={params}
          current={currency}
          basePath="/cuentas"
        />
      )}
      <AccountTotals
        currency={currency}
        accounts={accounts.filter((a) => a.currency === currency)}
      />
      <p className="mb-6 text-xs text-slate-400">
        Los totales incluyen todas tus cuentas, también las deshabilitadas con
        saldo. El valor de las inversiones se consulta en su propia pestaña.
      </p>
      <AccountsWorkspace
        accounts={accounts}
        defaultAccountId={profile.data.default_account_id}
      />
    </>
  );
}

function AccountTotals({
  accounts,
  currency,
}: {
  accounts: AccountWithBalance[];
  currency: Currency;
}) {
  const available = accounts
    .filter((a) => a.type !== "credit")
    .reduce((s, a) => s + a.balance_cents, 0);
  const debt = accounts
    .filter((a) => a.type === "credit")
    .reduce((s, a) => s + Math.max(0, -a.balance_cents), 0);
  const favor = accounts
    .filter((a) => a.type === "credit")
    .reduce((s, a) => s + Math.max(0, a.balance_cents), 0);
  return (
    <section className="mb-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Saldo neto en cuentas"
          value={available + favor - debt}
          currency={currency}
          icon="wallet"
          emphasis
        />
        <StatCard
          tone="income"
          label="Dinero en cuentas"
          value={available}
          currency={currency}
          icon="wallet"
          footnote="Efectivo, débito y ahorro"
        />
        <StatCard
          tone="expense"
          label="Deuda en tarjetas"
          value={debt}
          currency={currency}
          icon="list"
          footnote="Las deudas no se ocultan con saldos a favor"
        />
        <StatCard
          tone="income"
          label="A favor en tarjetas"
          value={favor}
          currency={currency}
          icon="arrow"
        />
      </div>
    </section>
  );
}
