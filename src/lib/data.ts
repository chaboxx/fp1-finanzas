import type { SupabaseClient } from "@supabase/supabase-js";
import type { Account, Category } from "@/lib/types";

// Cuentas, categorías y cuenta por defecto: lo que necesita el formulario de movimientos.
export async function getMovementFormOptions(supabase: SupabaseClient, userId: string) {
  const [accounts, categories, profile] = await Promise.all([
    supabase.from("accounts").select("id, name, type, is_active").order("created_at"),
    supabase.from("categories").select("id, name, kind, color, is_active").in("kind", ["expense", "income"]).order("name"),
    supabase.from("profiles").select("default_account_id").eq("id", userId).single(),
  ]);
  if (accounts.error || categories.error) {
    throw new Error("No se pudieron cargar cuentas y categorías");
  }
  return {
    accounts: accounts.data as Account[],
    categories: categories.data as Category[],
    defaultAccountId: (profile.data?.default_account_id as string | null) ?? null,
  };
}
