import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import type { Database } from "@/lib/database.types";
import { fetchAll } from "@/lib/finance-data";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET,
    key = process.env.SUPABASE_SECRET_KEY,
    url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!secret || !key || !url)
    return Response.json(
      { error: "Programación no configurada" },
      { status: 503 },
    );
  const actual = Buffer.from(request.headers.get("authorization") ?? ""),
    expected = Buffer.from("Bearer " + secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return Response.json({ error: "Acceso denegado" }, { status: 401 });
  const db = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const rules = await fetchAll((a, b) =>
    db
      .from("recurring_rules")
      .select("user_id")
      .eq("is_active", true)
      .order("id")
      .range(a, b),
  );
  let created = 0;
  for (const user of new Set(rules.map((r) => r.user_id))) {
    const { error, data } = await db.rpc("generate_recurring_transactions", {
      p_user: user,
    });
    if (error)
      return Response.json(
        { error: "No se pudo procesar un usuario" },
        { status: 500 },
      );
    created += data ?? 0;
  }
  return Response.json({ created });
}
