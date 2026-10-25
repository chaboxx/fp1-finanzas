import { FormModal, RouteModal } from "@/components/form-modal";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, LoadingPanel } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fetchAll, getCatalogs } from "@/lib/finance-data";
import { todayISO } from "@/lib/dates";
import { RecurringForm, RecurringList } from "./recurring-ui";
export default function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <>
      <PageHeader
        title="Lo que se repite, organizado"
        description="Automatiza el registro de sueldo, renta, suscripciones y transferencias."
        actions={
          <Link href="/movimientos" className="btn btn-secondary">
            Volver a movimientos
          </Link>
        }
      />
      <Suspense fallback={<LoadingPanel />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  );
}
async function Content({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, userId } = await requireUser(),
    params = await searchParams;
  const [allCatalogs, rules] = await Promise.all([
    getCatalogs(supabase, userId),
    fetchAll((a, b) =>
      supabase
        .from("recurring_rules")
        .select("*")
        .order("created_at")
        .order("id")
        .range(a, b),
    ),
  ]);
  const editing = rules.find((r) => r.id === params.editar);
  // Los recurrentes son solo en soles (decisión del usuario): ni las cuentas en
  // dólares ni una cuenta por defecto en dólares se ofrecen.
  const accounts = allCatalogs.accounts.filter((a) => a.currency === "PEN");
  const catalogs = {
    ...allCatalogs,
    accounts,
    defaultAccountId: accounts.some(
      (a) => a.id === allCatalogs.defaultAccountId,
    )
      ? allCatalogs.defaultAccountId
      : null,
  };
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <FormModal
          title="Nueva regla recurrente"
          triggerLabel="Crear recurrente"
        >
          <RecurringForm {...catalogs} today={todayISO()} />
        </FormModal>
      </div>
      {editing && (
        <RouteModal
          title="Editar recurrente"
          closeHref="/movimientos/recurrentes"
        >
          <RecurringForm
            key={editing.id}
            {...catalogs}
            rule={editing}
            today={todayISO()}
          />
        </RouteModal>
      )}
      <RecurringList rules={rules} />
    </div>
  );
}
