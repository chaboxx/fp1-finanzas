import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "@/lib/database.types";

// Cliente para Server Components, Server Actions y Route Handlers.
// Crear uno nuevo por request: nunca compartirlo entre usuarios.
export async function createClient() {
  // Con Partial Prefetching, Next prerenderiza incluso lo que lee cookies (el
  // "App Shell" con datos de sesión). Supabase usa Date.now() para revisar si el
  // token venció, así que todo lo que lo use debe esperar a un request real.
  await connection();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Llamado desde un Server Component, donde no se pueden escribir
            // cookies. No pasa nada: el proxy ya refrescó la sesión.
          }
        },
      },
    },
  );
}
