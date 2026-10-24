import { RouteModal } from "@/components/form-modal";
import { Suspense } from "react";
import { PageHeader, LoadingPanel } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getMovementFormOptions } from "@/lib/data";
import { MovementForm } from "../movement-form";
export default function NewMovementPage({
  searchParams,
}: PageProps<"/movimientos/nuevo">) {
  return (
    <>
      <PageHeader
        title="Nuevo movimiento"
        description="Un registro rápido para tener tus cuentas al día."
      />
      <Suspense fallback={<LoadingPanel />}>
        <NewMovement searchParams={searchParams} />
      </Suspense>
    </>
  );
}
async function NewMovement({
  searchParams,
}: {
  searchParams: PageProps<"/movimientos/nuevo">["searchParams"];
}) {
  const { supabase, userId } = await requireUser(),
    params = await searchParams,
    options = await getMovementFormOptions(supabase, userId);
  const type =
    params.tipo === "transfer" || params.tipo === "income"
      ? params.tipo
      : "expense";
  return (
    <RouteModal title="Nuevo movimiento" closeHref="/movimientos">
      <MovementForm
        {...options}
        initialType={type}
        initialAccount={
          typeof params.cuenta === "string" ? params.cuenta : undefined
        }
      />
    </RouteModal>
  );
}
