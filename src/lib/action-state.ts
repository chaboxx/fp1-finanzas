import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";

// Estado que devuelven las Server Actions a los formularios (useActionState).
export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string | undefined>;
  // Lo que el usuario escribió: React resetea el formulario tras cada envío,
  // así que en caso de error se devuelve para volver a mostrarlo.
  values?: Record<string, string>;
};

export function formValues(formData: FormData): Record<string, string> {
  return Object.fromEntries([...formData.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)]));
}

export function fromZodError(error: z.ZodError): ActionState {
  const flat = z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
  return {
    fieldErrors: Object.fromEntries(Object.entries(flat).map(([k, v]) => [k, v?.[0]])),
  };
}

// Traduce errores de Postgres a mensajes para el usuario. Los triggers ya
// lanzan mensajes en español con código check_violation (23514).
export function fromDbError(error: PostgrestError, duplicateMessage = "Ya existe un registro con ese nombre"): ActionState {
  switch (error.code) {
    case "23505":
      return { error: duplicateMessage };
    case "23514":
    case "P0001":
      return { error: error.message.startsWith("new row") ? "Datos inválidos" : error.message };
    default:
      console.error("Error de base de datos", error);
      return { error: "No se pudo guardar. Intenta de nuevo." };
  }
}
