"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formValues, fromDbError, fromZodError, type ActionState } from "@/lib/action-state";
import { requireUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { formatCents, parseToCents } from "@/lib/money";

const optionalUuid = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.uuid().nullable());

const movementSchema = z
  .object({
    id: optionalUuid,
    type: z.enum(["expense", "income", "transfer"], { error: "Elige un tipo" }),
    amount: z.string().transform((v, ctx) => {
      const cents = parseToCents(v);
      if (!cents) {
        ctx.addIssue({ code: "custom", message: cents === 0 ? "El monto debe ser mayor a 0" : "Ingresa un monto. Ejemplo: 15.50" });
        return z.NEVER;
      }
      return cents;
    }),
    description: z.string().trim().max(140, { error: "Máximo 140 caracteres" }).transform((v) => v || null),
    categoryId: optionalUuid,
    accountId: optionalUuid, // vacío => cuenta por defecto (lo resuelve la base de datos)
    toAccountId: optionalUuid,
    occurredOn: z
      .string()
      .optional()
      .transform((v) => v || null) // vacío => hoy (lo resuelve la base de datos)
      .pipe(z.iso.date({ error: "Fecha inválida" }).nullable()),
  })
  .superRefine((m, ctx) => {
    if (m.type !== "transfer" && !m.categoryId) {
      ctx.addIssue({ code: "custom", path: ["categoryId"], message: "Elige una categoría" });
    }
    if (m.type === "transfer") {
      if (!m.accountId) ctx.addIssue({ code: "custom", path: ["accountId"], message: "Elige la cuenta de origen" });
      if (!m.toAccountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Elige la cuenta de destino" });
      if (m.accountId && m.accountId === m.toAccountId) {
        ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Debe ser distinta a la de origen" });
      }
    }
  });

const TYPE_LABEL = { expense: "Gasto", income: "Ingreso", transfer: "Transferencia" } as const;

export async function saveMovement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = movementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ...fromZodError(parsed.error), values: formValues(formData) };
  const m = parsed.data;

  const row = {
    type: m.type,
    amount_cents: m.amount,
    description: m.description,
    category_id: m.type === "transfer" ? null : m.categoryId,
    to_account_id: m.type === "transfer" ? m.toAccountId : null,
    // null hace que el trigger use la cuenta por defecto.
    account_id: m.accountId,
    // Solo se envía si el usuario la puso; si no, la base usa "hoy" en Lima.
    ...(m.occurredOn ? { occurred_on: m.occurredOn } : {}),
  };

  const { supabase } = await requireUser();
  const { error } = m.id
    ? await supabase.from("transactions").update(row).eq("id", m.id)
    : await supabase.from("transactions").insert(row);
  if (error) return { ...fromDbError(error), values: formValues(formData) };

  if (m.id) {
    redirect(`/movimientos?mes=${(m.occurredOn ?? todayISO()).slice(0, 7)}`);
  }
  refresh();
  return { ok: true, message: `${TYPE_LABEL[m.type]} de ${formatCents(m.amount)} guardado` };
}

export async function deleteMovement(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const { supabase } = await requireUser();
  await supabase.from("transactions").delete().eq("id", id);
  refresh();
}
