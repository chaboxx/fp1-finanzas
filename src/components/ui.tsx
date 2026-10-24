import type { ButtonHTMLAttributes, SelectHTMLAttributes } from "react";
import { RequiredMark } from "./required-mark";
export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <section className={"panel " + className}>{children}</section>;
}
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="eyebrow mb-2">Tu espacio financiero</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {description && <p className="muted mt-2">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "muted";
  children: React.ReactNode;
}) {
  const styles = {
    neutral: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    success:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    muted: "bg-slate-100 text-slate-500 dark:bg-slate-800",
  }[tone];
  return (
    <span
      className={"rounded-full px-2.5 py-1 text-[11px] font-semibold " + styles}
    >
      {children}
    </span>
  );
}
export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <button className={"btn btn-" + variant + " " + className} {...props} />
  );
}
export function SelectField({
  label,
  name,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; name: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
        {props.required && <RequiredMark />}
      </label>
      <select id={name} name={name} className="field" {...props}>
        {children}
      </select>
    </div>
  );
}
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="py-12 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-2xl text-blue-600 dark:bg-blue-950">
        ↗
      </div>
      <h2 className="font-semibold">{title}</h2>
      <p className="muted mx-auto mt-2 max-w-md">{description}</p>
      {children && <div className="mt-5">{children}</div>}
    </Card>
  );
}
export function LoadingPanel() {
  return (
    <div
      role="status"
      aria-label="Cargando datos"
      className="h-80 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800"
    />
  );
}
