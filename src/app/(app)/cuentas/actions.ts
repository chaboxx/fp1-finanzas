"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  formValues,
  fromDbError,
  fromZodError,
  type ActionState,
} from "@/lib/action-state";
import { requireUser } from "@/lib/auth";
import { parseToCents } from "@/lib/money";

const DUPLICATE = "Ya tienes una cuenta con ese nombre";

const name = z
  .string()
  .trim()
  .min(1, { error: "Ponle un nombre" })
  .max(60, { error: "Máximo 60 caracteres" });
const amount = z.string().transform((v, ctx) => {
  if (v.trim() === "") return 0;
  const cents = parseToCents(v);
  if (cents === null) {
    ctx.addIssue({
      code: "custom",
      message: "Monto inválido. Ejemplo: 1500.50",
    });
    return z.NEVER;
  }
  return cents;
});

const currency = z.enum(["PEN", "USD"], { error: "Elige una moneda" });

const createSchema = z.object({
  name,
  currency: currency.default("PEN"),
  type: z.enum(["cash", "debit", "credit", "savings"], {
    error: "Elige un tipo",
  }),
  initialBalance: amount,
});

const updateSchema = z.object({
  id: z.uuid(),
  name,
  currency: currency.optional(),
  initialBalance: amount,
});

// En tarjetas de crédito el usuario escribe la deuda en positivo; se guarda en negativo.
function signedBalance(type: string, cents: number) {
  return type === "credit" ? -cents : cents;
}

export async function createAccount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { ...fromZodError(parsed.error), values: formValues(formData) };

  const { supabase } = await requireUser();
  const { error } = await supabase.from("accounts").insert({
    name: parsed.data.name,
    type: parsed.data.type,
    currency: parsed.data.currency,
    initial_balance_cents: signedBalance(
      parsed.data.type,
      parsed.data.initialBalance,
    ),
  });
  if (error)
    return { ...fromDbError(error, DUPLICATE), values: formValues(formData) };

  refresh();
  return { ok: true };
}

export async function updateAccount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { ...fromZodError(parsed.error), values: formValues(formData) };

  const { supabase } = await requireUser();
  const { data: account } = await supabase
    .from("accounts")
    .select("type")
    .eq("id", parsed.data.id)
    .single();
  if (!account) return { error: "La cuenta no existe" };

  const { error } = await supabase
    .from("accounts")
    .update({
      name: parsed.data.name,
      // La base rechaza el cambio si la cuenta ya tiene movimientos.
      ...(parsed.data.currency ? { currency: parsed.data.currency } : {}),
      initial_balance_cents: signedBalance(
        account.type,
        parsed.data.initialBalance,
      ),
    })
    .eq("id", parsed.data.id);
  if (error)
    return { ...fromDbError(error, DUPLICATE), values: formValues(formData) };

  refresh();
  return { ok: true };
}

export async function setAccountActive(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = z.uuid().parse(formData.get("id"));
  const active = formData.get("active") === "true";

  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("accounts")
    .update({ is_active: active })
    .eq("id", id);
  if (error) return fromDbError(error);

  refresh();
  return { ok: true };
}

export async function setDefaultAccount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = z.uuid().parse(formData.get("id"));

  const { supabase, userId } = await requireUser();
  const { error } = await supabase
    .from("profiles")
    .update({ default_account_id: id })
    .eq("id", userId);
  if (error) return fromDbError(error);

  refresh();
  return { ok: true };
}
