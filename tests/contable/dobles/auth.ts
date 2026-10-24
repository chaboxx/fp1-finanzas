// Doble de "@/lib/auth": en vez de leer la cookie de Supabase, usa la sesión que
// el test abre con signIn(). El cliente que devuelve aplica RLS como ese usuario.
import type { PGlite } from "@electric-sql/pglite";
import type { TestUser } from "../db";
import { createFakeClient } from "../fake-supabase";
import { redirect } from "./next-navigation";

let session: { db: PGlite; user: TestUser } | null = null;

export function signIn(db: PGlite, user: TestUser) {
  session = { db, user };
}

export function signOut() {
  session = null;
}

export async function requireUser() {
  if (!session) redirect("/login");
  const { db, user } = session!;
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- el doble imita solo la parte que usa la app
    supabase: createFakeClient(db, user.id) as any,
    userId: user.id,
    email: user.email as string | undefined,
  };
}
