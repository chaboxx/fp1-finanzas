import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Defensa en profundidad: el proxy ya redirige sin sesión, pero toda página o
// acción que lea datos privados vuelve a verificar al usuario en el servidor.
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/login");
  }
  return {
    supabase,
    userId: data.claims.sub,
    email: data.claims.email as string | undefined,
  };
}
