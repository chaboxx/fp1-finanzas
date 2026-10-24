"use server";
import { z } from "zod";
import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { parseToCents } from "@/lib/money";
import { parsePercentage } from "@/lib/budget";
import { isMonth } from "@/lib/dates";
import { fromDbError, type ActionState } from "@/lib/action-state";
export async function saveBudget(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const { supabase } = await requireUser(),
    month = String(fd.get("month") ?? ""),
    total = parseToCents(String(fd.get("total") ?? ""));
  if (!isMonth(month)) return { error: "Elige un mes válido" };
  if (!total || total <= 0)
    return { error: "El total previsto debe ser mayor a cero" };
  const allocations: { category_id: string; percentage_bps: number }[] = [];
  for (const [key, value] of fd) {
    if (!key.startsWith("pct_")) continue;
    const id = key.slice(4),
      bps = parsePercentage(String(value));
    if (!z.uuid().safeParse(id).success || bps === null)
      return {
        error: "Usa porcentajes entre 0 y 100, con hasta dos decimales",
      };
    if (bps > 0) allocations.push({ category_id: id, percentage_bps: bps });
  }
  if (allocations.reduce((s, r) => s + r.percentage_bps, 0) > 10000)
    return { error: "Los porcentajes no pueden superar el 100 %" };
  const { error } = await supabase.rpc("save_budget_plan", {
    p_month: month + "-01",
    p_total: total,
    p_allocations: allocations,
  });
  if (error) return fromDbError(error);
  refresh();
  return {
    ok: true,
    message:
      "Presupuesto guardado. El total previsto se mantendrá aunque cambien tus ingresos.",
  };
}
