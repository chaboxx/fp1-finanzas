import type { InputHTMLAttributes } from "react";

type FormFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  error?: string;
};

export function FormField({ label, name, error, ...inputProps }: FormFieldProps) {
  const errorId = `${name}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className="h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 aria-invalid:border-red-500 dark:border-zinc-700 dark:bg-zinc-900"
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 rounded-lg bg-emerald-600 font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Procesando…" : children}
    </button>
  );
}

export function FormAlert({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  const styles =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
      : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${styles}`}>
      {children}
    </p>
  );
}
