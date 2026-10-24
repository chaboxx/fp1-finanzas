"use server";
import { z } from "zod";
import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { addDays } from "@/lib/dashboard";
import { nextOccurrence } from "@/lib/recurrence";
import { parseToCents } from "@/lib/money";
import {
  fromDbError,
  fromZodError,
  type ActionState,
} from "@/lib/action-state";
const uuid = z
  .string()
  .transform((v) => v || null)
  .pipe(z.uuid().nullable());
const schema = z.object({
  id: uuid,
  type: z.enum(["expense", "income", "transfer"]),
  amount: z.string(),
  description: z.string().trim().min(1).max(140),
  categoryId: uuid,
  accountId: uuid,
  toAccountId: uuid,
  frequency: z.enum(["weekly", "monthly", "yearly"]),
  start: z.iso.date(),
  end: z
    .string()
    .transform((v) => v || null)
    .pipe(z.iso.date().nullable()),
});
export async function saveRecurring(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const { supabase } = await requireUser(),
    parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const r = parsed.data,
    amount = parseToCents(r.amount);
  if (!amount || amount < 0) return { error: "Ingresa un monto mayor a cero" };
  if (r.end && r.end < r.start)
    return { error: "La fecha final debe ser igual o posterior al inicio" };
  if (r.type !== "transfer" && !r.categoryId)
    return { error: "Selecciona una categoría" };
  if (
    r.type === "transfer" &&
    (!r.accountId || !r.toAccountId || r.accountId === r.toAccountId)
  )
    return { error: "Selecciona cuentas de origen y destino distintas" };
  const old = r.id
    ? await supabase
        .from("recurring_rules")
        .select("*")
        .eq("id", r.id)
        .maybeSingle()
    : null;
  if (r.id && (!old?.data || old.error))
    return { error: "La regla ya no existe" };
  const changed =
    old?.data &&
    (r.start !== old.data.start_on || r.frequency !== old.data.frequency);
  const next = changed
    ? nextOccurrence(r.start, r.frequency, addDays(todayISO(), 1))
    : old?.data
      ? { index: old.data.occurrence_index, date: old.data.next_run_on }
      : { index: 0, date: r.start };
  const row = {
    type: r.type,
    amount_cents: amount,
    description: r.description,
    category_id: r.type === "transfer" ? null : r.categoryId,
    account_id: r.accountId,
    to_account_id: r.type === "transfer" ? r.toAccountId : null,
    frequency: r.frequency,
    start_on: r.start,
    end_on: r.end,
    occurrence_index: next.index,
    next_run_on: next.date,
    last_error: null,
  };
  const { error } = r.id
    ? await supabase.from("recurring_rules").update(row).eq("id", r.id)
    : await supabase.from("recurring_rules").insert(row);
  if (error) return fromDbError(error);
  refresh();
  return {
    ok: true,
    message: "Regla guardada. Los movimientos existentes no se modifican.",
  };
}
export async function toggleRecurring(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const { supabase } = await requireUser(),
    id = z.uuid().parse(fd.get("id"));
  const { error } = await supabase
    .from("recurring_rules")
    .update({ is_active: fd.get("active") === "true", last_error: null })
    .eq("id", id);
  if (error) return fromDbError(error);
  refresh();
  return { ok: true };
}
export async function generatePending(): Promise<ActionState> {
  const { supabase } = await requireUser(),
    { error, data } = await supabase.rpc("generate_recurring_transactions");
  if (error) return fromDbError(error);
  refresh();
  return {
    ok: true,
    message:
      String(data ?? 0) +
      " movimientos creados. Las reglas con problemas muestran su motivo.",
  };
}
