"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { FormAlert, FormField, SubmitButton } from "@/components/form-field";
import { login, type AuthFormState } from "../actions";

// Errores que llegan por la URL desde /auth/confirm.
const URL_ERRORS: Record<string, string> = {
  enlace: "El enlace de confirmación no es válido o ya expiró.",
};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, {} as AuthFormState);
  const searchParams = useSearchParams();
  const urlError = URL_ERRORS[searchParams.get("error") ?? ""];

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <h1 className="text-xl font-semibold">Iniciar sesión</h1>

      {(state.error ?? urlError) && <FormAlert tone="error">{state.error ?? urlError}</FormAlert>}

      <FormField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        defaultValue={state.email}
        error={state.fieldErrors?.email}
        required
      />
      <FormField
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="current-password"
        error={state.fieldErrors?.password}
        required
      />

      <SubmitButton pending={pending}>Entrar</SubmitButton>

      <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
        ¿No tienes cuenta?{" "}
        <Link href="/signup" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          Crear cuenta
        </Link>
      </p>
    </form>
  );
}
