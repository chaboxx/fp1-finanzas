"use server";
import { z } from "zod";
import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  fromDbError,
  fromZodError,
  type ActionState,
} from "@/lib/action-state";
export async function saveProfile(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const parsed = z
    .object({
      displayName: z.string().trim().max(60),
      theme: z.enum(["light", "dark", "system"]),
    })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.data.displayName || null,
      theme: parsed.data.theme,
    })
    .eq("id", userId);
  if (error) return fromDbError(error);
  refresh();
  return { ok: true, message: "Tu perfil y apariencia quedaron guardados." };
}
