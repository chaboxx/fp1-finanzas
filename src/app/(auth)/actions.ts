"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error?: string;
  fieldErrors?: Partial<
    Record<"email" | "password" | "confirmPassword", string>
  >;
  message?: string;
  email?: string; // para no vaciar el campo cuando hay error
};

const email = z.email({ error: "Ingresa un email válido" });

const loginSchema = z.object({
  email,
  password: z.string().min(1, { error: "Ingresa tu contraseña" }),
});

const signupSchema = z
  .object({
    email,
    password: z.string().min(8, { error: "Mínimo 8 caracteres" }),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    error: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

// Traduce los códigos de error de Supabase Auth a mensajes para el usuario.
function authErrorMessage(code: string | undefined): string {
  switch (code) {
    case "invalid_credentials":
      return "Email o contraseña incorrectos";
    case "email_not_confirmed":
      return "Confirma tu email antes de entrar. Revisa tu bandeja de entrada.";
    case "user_already_exists":
      return "Ya existe una cuenta con ese email";
    case "weak_password":
      return "La contraseña es muy débil";
    case "over_email_send_rate_limit":
      return "Demasiados intentos. Espera unos minutos y vuelve a intentar.";
    default:
      return "No se pudo completar la operación. Intenta de nuevo.";
  }
}

function fieldErrors(error: z.ZodError): AuthFormState["fieldErrors"] {
  const flat = z.flattenError(error).fieldErrors as Record<
    string,
    string[] | undefined
  >;
  return Object.fromEntries(
    Object.entries(flat).map(([field, messages]) => [field, messages?.[0]]),
  );
}

export async function login(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  const submittedEmail = String(formData.get("email") ?? "");
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error), email: submittedEmail };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: authErrorMessage(error.code), email: submittedEmail };
  }

  redirect("/");
}

export async function signup(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  const submittedEmail = String(formData.get("email") ?? "");
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error), email: submittedEmail };
  }

  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) {
    return { error: authErrorMessage(error.code), email: submittedEmail };
  }

  // Si la confirmación por email está desactivada en Supabase, ya hay sesión.
  if (data.session) {
    redirect("/");
  }

  return {
    message: `Te enviamos un enlace de confirmación a ${parsed.data.email}. Ábrelo para activar tu cuenta.`,
  };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
