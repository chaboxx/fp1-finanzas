import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import type { AccountWithBalance } from "@/lib/types";
import { AccountList, CreateAccountForm } from "./accounts-ui";

export const metadata: Metadata = { title: "Cuentas · Finanzas" };

export default function AccountsPage() {
  return (
    <>
      <PageHeader title="Cuentas" description="Tus billeteras: efectivo, débito, tarjetas de crédito y ahorro." />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />}>
        <Accounts />
      </Suspense>
    </>
  );
}

async function Accounts() {
  const { supabase, userId } = await requireUser();
  const [accountsRes, balancesRes, profileRes] = await Promise.all([
    supabase.from("accounts").select("id, name, type, is_active, initial_balance_cents").order("created_at"),
    supabase.from("account_balances").select("account_id, balance_cents"),
    supabase.from("profiles").select("default_account_id").eq("id", userId).single(),
  ]);
  if (accountsRes.error || balancesRes.error) {
    throw new Error("No se pudieron cargar las cuentas");
  }

  const balanceById = new Map(balancesRes.data.map((b) => [b.account_id, Number(b.balance_cents)]));
  const accounts: AccountWithBalance[] = accountsRes.data.map((a) => ({
    ...a,
    initial_balance_cents: Number(a.initial_balance_cents),
    balance_cents: balanceById.get(a.id) ?? Number(a.initial_balance_cents),
  }));
  const defaultAccountId = profileRes.data?.default_account_id ?? null;

  // Disponible = lo que tienes; deuda = saldo negativo de tarjetas de crédito.
  const available = accounts.filter((a) => a.type !== "credit").reduce((s, a) => s + a.balance_cents, 0);
  const debt = accounts.filter((a) => a.type === "credit").reduce((s, a) => s + a.balance_cents, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="Saldo total" value={available + debt} emphasis />
        <SummaryCard label="Disponible" value={available} />
        <SummaryCard label="Deuda en tarjetas" value={Math.abs(debt)} />
      </div>

      {accounts.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-500">
            Aún no tienes cuentas. Crea la primera: será tu cuenta por defecto para los gastos rápidos.
          </p>
        </Card>
      ) : (
        <AccountList accounts={accounts} defaultAccountId={defaultAccountId} />
      )}

      <CreateAccountForm />
    </div>
  );
}

function SummaryCard({ label, value, emphasis = false }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <Card>
      <p className="text-sm text-zinc-500">{label}</p>
      <p className={`mt-1 font-semibold tabular-nums ${emphasis ? "text-2xl" : "text-xl"} ${value < 0 ? "text-red-600" : ""}`}>
        {formatCents(value)}
      </p>
    </Card>
  );
}
