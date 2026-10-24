import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getMovementFormOptions } from "@/lib/data";
import type { Movement } from "@/lib/types";
import { MovementForm } from "../movement-form";

export const metadata: Metadata = { title: "Editar movimiento · Finanzas" };

// La página no espera params: se lo pasa al componente dentro de Suspense
// para que el resto de la página sea parte del "static shell".
export default function EditMovementPage({
  params,
}: PageProps<"/movimientos/[id]">) {
  return (
    <>
      <PageHeader title="Editar movimiento" />
      <Suspense
        fallback={
          <div className="h-96 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
        }
      >
        <EditMovement params={params} />
      </Suspense>
    </>
  );
}

async function EditMovement({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId } = await requireUser();
  const [options, { data }] = await Promise.all([
    getMovementFormOptions(supabase, userId),
    supabase
      .from("transactions")
      .select(
        "id, type, amount_cents, occurred_on, description, account_id, to_account_id, category_id",
      )
      .eq("id", id)
      .maybeSingle(),
  ]);
  // Inversiones se editan en su propia pantalla (Sprint 6).
  if (!data || !["expense", "income", "transfer"].includes(data.type))
    notFound();

  return (
    <MovementForm
      {...options}
      movement={
        { ...data, amount_cents: Number(data.amount_cents) } as Movement
      }
    />
  );
}
