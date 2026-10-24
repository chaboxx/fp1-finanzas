import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getMovementFormOptions } from "@/lib/data";
import { MovementForm } from "../movement-form";

export const metadata: Metadata = { title: "Nuevo movimiento · Finanzas" };

export default function NewMovementPage() {
  return (
    <>
      <PageHeader title="Nuevo movimiento" />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />}>
        <NewMovement />
      </Suspense>
    </>
  );
}

async function NewMovement() {
  const { supabase, userId } = await requireUser();
  const options = await getMovementFormOptions(supabase, userId);
  return <MovementForm {...options} />;
}
