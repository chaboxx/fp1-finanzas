import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import type { Category } from "@/lib/types";
import { CategoriesManager } from "./categories-ui";

export const metadata: Metadata = { title: "Categorías · Finanzas" };

export default function CategoriesPage() {
  return (
    <>
      <PageHeader
        title="Categorías"
        description="Organiza tus gastos, ingresos e inversiones. Las categorías no se borran: se deshabilitan y su historial se conserva."
      />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />}>
        <Categories />
      </Suspense>
    </>
  );
}

async function Categories() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, kind, color, is_active")
    .order("is_active", { ascending: false })
    .order("name");
  if (error) throw new Error("No se pudieron cargar las categorías");

  return <CategoriesManager categories={data as Category[]} />;
}
