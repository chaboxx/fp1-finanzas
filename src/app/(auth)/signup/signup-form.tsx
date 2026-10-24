"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormAlert, FormField, SubmitButton } from "@/components/form-field";
import { signup, type AuthFormState } from "../actions";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(
    signup,
    {} as AuthFormState,
  );

  if (state.message) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Revisa tu correo</h1>
        <FormAlert tone="success">{state.message}</FormAlert>
        <Link
          href="/login"
          className="text-center text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          Volver a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <h1 className="text-xl font-semibold">Crear cuenta</h1>

      {state.error && <FormAlert tone="error">{state.error}</FormAlert>}

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
        autoComplete="new-password"
        minLength={8}
        error={state.fieldErrors?.password}
        required
      />
      <FormField
        label="Repite la contraseña"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
        required
      />

      <SubmitButton pending={pending}>Crear cuenta</SubmitButton>

      <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
        ¿Ya tienes cuenta?{" "}
        <Link
          href="/login"
          className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          Inicia sesión
        </Link>
      </p>
    </form>
  );
}
