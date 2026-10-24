"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { formValues, fromDbError, fromZodError, type ActionState } from "@/lib/action-state";
import { requireUser } from "@/lib/auth";

const DUPLICATE = "Ya tienes una categoría con ese nombre en esta sección";

const name = z.string().trim().min(1, { error: "Ponle un nombre" }).max(40, { error: "Máximo 40 caracteres" });
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: "Color inválido" });

const createSchema = z.object({
  name,
  color,
  kind: z.enum(["expense", "income", "investment"]),
});

const updateSchema = z.object({
  id: z.uuid(),
  name,
  color,
});

export async function createCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ...fromZodError(parsed.error), values: formValues(formData) };

  const { supabase } = await requireUser();
  const { error } = await supabase.from("categories").insert(parsed.data);
  if (error) return { ...fromDbError(error, DUPLICATE), values: formValues(formData) };

  refresh();
  return { ok: true };
}

// Renombrar cambia el nombre también en el historial: los movimientos guardan el id, no el nombre.
export async function updateCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ...fromZodError(parsed.error), values: formValues(formData) };

  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("categories")
    .update({ name: parsed.data.name, color: parsed.data.color })
    .eq("id", parsed.data.id);
  if (error) return { ...fromDbError(error, DUPLICATE), values: formValues(formData) };

  refresh();
  return { ok: true };
}

// No existe "borrar": deshabilitar la oculta del formulario pero conserva el historial.
export async function setCategoryActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = z.uuid().parse(formData.get("id"));
  const active = formData.get("active") === "true";

  const { supabase } = await requireUser();
  const { error } = await supabase.from("categories").update({ is_active: active }).eq("id", id);
  if (error) return fromDbError(error);

  refresh();
  return { ok: true };
}
