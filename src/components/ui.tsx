import type { ButtonHTMLAttributes, SelectHTMLAttributes } from "react";

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={`rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>
      {children}
    </section>
  );
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "success" | "muted"; children: React.ReactNode }) {
  const styles = {
    neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    muted: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>{children}</span>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" };

export function Button({ variant = "secondary", className = "", ...props }: ButtonProps) {
  const styles = {
    primary: "bg-emerald-600 text-white hover:bg-emerald-700",
    secondary: "border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800",
    ghost: "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
  }[variant];
  return (
    <button
      className={`h-9 rounded-lg px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${styles} ${className}`}
      {...props}
    />
  );
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; name: string };

export function SelectField({ label, name, children, ...props }: SelectFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={name}
        name={name}
        className="h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 dark:border-zinc-700 dark:bg-zinc-900"
        {...props}
      >
        {children}
      </select>
    </div>
  );
}
