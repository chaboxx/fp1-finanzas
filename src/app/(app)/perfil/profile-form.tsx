"use client";
import { useActionState, useState, useTransition } from "react";
import { Card } from "@/components/ui";
import { RequiredMark } from "@/components/required-mark";
import { FormAlert, FormField, SubmitButton } from "@/components/form-field";
import { applyTheme, type ThemePreference } from "@/lib/theme";
import { saveProfile } from "./actions";
export function ProfileForm({
  email,
  name,
  preference,
}: {
  email: string;
  name: string;
  preference: ThemePreference;
}) {
  const [theme, setTheme] = useState(preference),
    [state, action, pending] = useActionState(saveProfile, {}),
    [, startTransition] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="max-w-3xl space-y-6"
    >
      <Card>
        <h2 className="mb-5 font-semibold">Tus datos</h2>
        <FormField
          label="Nombre"
          name="displayName"
          defaultValue={name}
          maxLength={60}
          placeholder="¿Cómo te llamas?"
        />
        <p className="mt-4 text-xs text-slate-500">
          Email de acceso: <strong>{email}</strong>
        </p>
      </Card>
      <Card>
        <h2 className="font-semibold">Apariencia</h2>
        <p className="muted mt-2 text-xs">
          El tema claro es el predeterminado. Puedes probar otro y guardar tu
          elección en el perfil.
        </p>
        <p className="mt-6 text-sm font-medium">
          Tema
          <RequiredMark />
        </p>
        <div
          className="mt-3 grid gap-3 sm:grid-cols-3"
          role="radiogroup"
          aria-label="Tema de la app"
        >
          {(
            [
              ["light", "Claro", "☀", "Fondos claros y acentos suaves"],
              ["dark", "Oscuro", "☾", "Menos brillo para la noche"],
              [
                "system",
                "Del sistema",
                "◐",
                "Sigue la apariencia del dispositivo",
              ],
            ] as const
          ).map(([value, label, symbol, description]) => (
            <label
              key={value}
              className={
                "cursor-pointer rounded-2xl border-2 p-4 transition " +
                (theme === value
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40"
                  : "border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-900")
              }
            >
              <input
                className="mb-3 size-4 accent-blue-600"
                type="radio"
                name="theme"
                required
                value={value}
                checked={theme === value}
                onChange={() => {
                  setTheme(value);
                  applyTheme(value);
                }}
              />
              <div
                className={
                  "mb-4 flex h-16 items-center justify-center rounded-xl text-3xl " +
                  (value === "dark"
                    ? "bg-slate-800 text-slate-100"
                    : value === "light"
                      ? "bg-amber-50 text-amber-500"
                      : "bg-blue-100 text-blue-600")
                }
              >
                {symbol}
              </div>
              <strong className="text-sm">{label}</strong>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                {description}
              </p>
            </label>
          ))}
        </div>
      </Card>
      {state.error && <FormAlert tone="error">{state.error}</FormAlert>}
      {state.fieldErrors && (
        <FormAlert tone="error">
          Revisa el nombre y el tema seleccionado.
        </FormAlert>
      )}
      {state.ok && <FormAlert tone="success">{state.message}</FormAlert>}
      <div className="w-56">
        <SubmitButton pending={pending}>Guardar perfil</SubmitButton>
      </div>
    </form>
  );
}
