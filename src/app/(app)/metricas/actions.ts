"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { formValues, fromDbError, fromZodError, type ActionState } from "@/lib/action-state";
import { requireUser } from "@/lib/auth";
import { parsePercentage } from "@/lib/budget";
import { isMonth } from "@/lib/dates";
import { parseToCents } from "@/lib/money";

const schema = z.object({
  month: z.string().refine(isMonth, { error: "Mes inválido" }),
  savingsRate: z.string().transform((v, ctx) => {
    const bps = parsePercentage(v);
    if (bps === null || v.trim() === "") {
      ctx.addIssue({ code: "custom", message: "Escribe un porcentaje entre 0 y 100" });
      return z.NEVER;
    }
    return bps;
  }),
  monthlyInvestment: z.string().transform((v, ctx) => {
    if (v.trim() === "") return 0;
    const cents = parseToCents(v);
    if (cents === null || cents < 0) {
      ctx.addIssue({ code: "custom", message: "Monto inválido. Ejemplo: 500" });
      return z.NEVER;
    }
    return cents;
  }),
  emergencyMonths: z.coerce
    .number({ error: "Escribe un número de meses" })
    .int({ error: "Usa meses enteros" })
    .min(1, { error: "Mínimo 1 mes" })
    .max(24, { error: "Máximo 24 meses" }),
});

// Las metas valen desde el mes indicado en adelante; los meses anteriores conservan las suyas.
export async function saveTargets(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ...fromZodError(parsed.error), values: formValues(formData) };
  const included = z.array(z.uuid()).safeParse(formData.getAll("emergencyAccount"));
  if (!included.success) return { error: "Selección de cuentas inválida" };

  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("financial_targets").upsert(
    {
      user_id: userId,
      effective_month: parsed.data.month + "-01",
      savings_rate_bps: parsed.data.savingsRate,
      monthly_investment_cents: parsed.data.monthlyInvestment,
      emergency_months: parsed.data.emergencyMonths,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,effective_month" },
  );
  if (error) return { ...fromDbError(error), values: formValues(formData) };

  // Fondo de emergencia: las cuentas marcadas cuentan, las demás no (las tarjetas nunca).
  const ids = included.data;
  const on = ids.length
    ? await supabase.from("accounts").update({ in_emergency_fund: true }).in("id", ids)
    : { error: null };
  let off = supabase.from("accounts").update({ in_emergency_fund: false }).neq("type", "credit");
  if (ids.length) off = off.not("id", "in", `(${ids.join(",")})`);
  const offResult = await off;
  const accountError = on.error ?? offResult.error;
  if (accountError) return fromDbError(accountError);

  refresh();
  return { ok: true, message: "Metas guardadas." };
}
