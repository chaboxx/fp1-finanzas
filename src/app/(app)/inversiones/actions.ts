"use server";
import { z } from "zod";
import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { parseToCents } from "@/lib/money";
import {
  formValues,
  fromDbError,
  fromZodError,
  type ActionState,
} from "@/lib/action-state";
const uuid = z
  .string()
  .transform((v) => v || null)
  .pipe(z.uuid().nullable());
const schema = z.object({
  operation: z.enum(["invest", "divest", "valuation", "opening"]),
  requestId: z.uuid(),
  investmentId: uuid,
  categoryId: uuid,
  accountId: uuid,
  entryId: uuid,
  name: z.string().trim().max(60),
  platform: z.string().trim().max(100),
  description: z.string().trim().max(140),
  date: z
    .string()
    .transform((v) => v || null)
    .pipe(z.iso.date().nullable()),
  amount: z.string(),
  initialCapital: z.string(),
});
export async function saveInvestment(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const { supabase } = await requireUser(),
    parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success)
    return { ...fromZodError(parsed.error), values: formValues(fd) };
  const m = parsed.data,
    amount = parseToCents(m.amount),
    initial = m.initialCapital.trim() ? parseToCents(m.initialCapital) : null;
  if (
    amount === null ||
    amount < 0 ||
    (!amount && ["invest", "divest"].includes(m.operation))
  )
    return {
      error:
        "Ingresa un monto válido; los aportes y rescates deben ser mayores a cero",
    };
  if (m.initialCapital.trim() && (initial === null || initial < 0))
    return {
      error: "El capital inicial debe ser un monto válido o quedar vacío",
    };
  if (!m.investmentId && !m.categoryId)
    return { error: "Selecciona una inversión o una categoría" };
  const { error } = await supabase.rpc("save_investment_entry", {
    p_operation: m.operation,
    p_amount: amount,
    p_request: m.requestId,
    p_investment: m.investmentId,
    p_category: m.categoryId,
    p_name: m.name,
    p_platform: m.platform,
    p_account: m.accountId,
    p_date: m.date,
    p_description: m.description,
    p_entry: m.entryId,
    p_initial_capital: initial,
  });
  if (error) return fromDbError(error);
  refresh();
  return {
    ok: true,
    message:
      m.operation === "valuation"
        ? "Valor actualizado; no se movió dinero de tus cuentas"
        : m.operation === "opening"
          ? "Inversión inicial registrada; no se descontó dinero de tus cuentas"
          : "Movimiento guardado y saldo actualizado",
  };
}
export async function updateInvestment(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const { supabase } = await requireUser(),
    parsed = z
      .object({
        id: z.uuid(),
        name: z.string().trim().min(1).max(60),
        platform: z.string().trim().max(100),
      })
      .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const { error } = await supabase
    .from("investments")
    .update({ name: parsed.data.name, platform: parsed.data.platform || null })
    .eq("id", parsed.data.id);
  if (error) return fromDbError(error);
  refresh();
  return { ok: true };
}
export async function setInvestmentActive(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const { supabase } = await requireUser(),
    id = z.uuid().parse(fd.get("id"));
  const { error } = await supabase
    .from("investments")
    .update({ is_active: fd.get("active") === "true" })
    .eq("id", id);
  if (error) return fromDbError(error);
  refresh();
  return { ok: true };
}
