"use client";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { FormField, SubmitButton, FormAlert } from "@/components/form-field";
import { Card, Badge } from "@/components/ui";
import { RequiredMark } from "@/components/required-mark";
import type { Account, Category } from "@/lib/types";
import type { DbRow } from "@/lib/finance-data";
import { centsToInput, formatCents } from "@/lib/money";
import { saveRecurring, toggleRecurring, generatePending } from "./actions";
import { useCloseModal } from "@/components/form-modal";
export function RecurringForm({
  accounts,
  categories,
  rule,
  today,
  defaultAccountId,
}: {
  accounts: Account[];
  categories: Category[];
  rule?: DbRow<"recurring_rules">;
  today: string;
  defaultAccountId: string | null;
}) {
  const closeModal = useCloseModal();
  const [type, setType] = useState(rule?.type ?? "expense"),
    [state, action, pending] = useActionState(
      async (prev: import("@/lib/action-state").ActionState, fd: FormData) => {
        const result = await saveRecurring(prev, fd);
        if (result.ok) closeModal?.();
        return result;
      },
      {},
    ),
    [, startTransition] = useTransition();
  return (
    <Card>
      <div className="mb-5 flex justify-between gap-3">
        <h2 className="font-semibold">
          {rule ? "Editar regla" : "Nueva regla recurrente"}
        </h2>
        {rule && (
          <Link
            href="/movimientos/recurrentes"
            className="text-xs text-blue-600"
          >
            Cancelar edición
          </Link>
        )}
      </div>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => action(fd));
        }}
        className="space-y-4"
      >
        <input type="hidden" name="id" value={rule?.id ?? ""} />
        {state.error && <FormAlert tone="error">{state.error}</FormAlert>}
        {state.fieldErrors && (
          <FormAlert tone="error">
            Revisa monto, descripción y fechas.
          </FormAlert>
        )}
        {state.ok && <FormAlert tone="success">{state.message}</FormAlert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Tipo
            <RequiredMark />
            <select
              className="field mt-1.5"
              name="type"
              required
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              <option value="expense">Gasto · renta, suscripción</option>
              <option value="income">Ingreso · sueldo</option>
              <option value="transfer">Transferencia entre cuentas</option>
            </select>
          </label>
          <FormField
            label="Monto (S/)"
            name="amount"
            inputMode="decimal"
            defaultValue={rule ? centsToInput(rule.amount_cents) : ""}
            required
          />
          <FormField
            label="Descripción"
            name="description"
            defaultValue={rule?.description}
            placeholder="Suscripción mensual"
            maxLength={140}
            required
          />
          {type !== "transfer" ? (
            <label className="text-sm font-medium">
              Categoría
              <RequiredMark />
              <select
                className="field mt-1.5"
                name="categoryId"
                required
                key={type}
                defaultValue={rule?.category_id ?? ""}
              >
                <option value="">Selecciona</option>
                {categories
                  .filter(
                    (c) =>
                      c.kind === type &&
                      (c.is_active || c.id === rule?.category_id),
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {!c.is_active ? " (deshabilitada)" : ""}
                    </option>
                  ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="categoryId" value="" />
          )}
          <label className="text-sm font-medium">
            {type === "transfer" ? "Cuenta de origen" : "Cuenta"}
            {type === "transfer" && <RequiredMark />}
            <select
              className="field mt-1.5"
              name="accountId"
              required={type === "transfer"}
              defaultValue={
                rule?.account_id ??
                (type === "transfer" ? (defaultAccountId ?? "") : "")
              }
            >
              <option value="">Predeterminada al generar</option>
              {accounts
                .filter((a) => a.is_active || a.id === rule?.account_id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
          {type === "transfer" ? (
            <label className="text-sm font-medium">
              Cuenta de destino
              <RequiredMark />
              <select
                className="field mt-1.5"
                name="toAccountId"
                required
                defaultValue={rule?.to_account_id ?? ""}
              >
                <option value="">Selecciona</option>
                {accounts
                  .filter((a) => a.is_active || a.id === rule?.to_account_id)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="toAccountId" value="" />
          )}
          <label className="text-sm font-medium">
            Frecuencia
            <RequiredMark />
            <select
              className="field mt-1.5"
              name="frequency"
              required
              defaultValue={rule?.frequency ?? "monthly"}
            >
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensual</option>
              <option value="yearly">Anual</option>
            </select>
          </label>
          <FormField
            label="Fecha de inicio"
            name="start"
            type="date"
            defaultValue={rule?.start_on ?? today}
            required
          />
          <FormField
            label="Fecha final"
            name="end"
            type="date"
            defaultValue={rule?.end_on ?? ""}
          />
        </div>
        <p className="rounded-xl bg-blue-50 p-3 text-xs leading-relaxed text-blue-700 dark:bg-blue-950 dark:text-blue-300">
          {rule
            ? "Editar el monto no cambia registros anteriores. Cambiar el calendario aplica a partir de mañana."
            : "Se registrarán automáticamente los vencimientos desde el inicio indicado. El día 31 se adapta al último día de los meses cortos."}
        </p>
        <div className="sm:w-52">
          <SubmitButton pending={pending}>Guardar regla</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
export function RecurringList({
  rules,
}: {
  rules: DbRow<"recurring_rules">[];
}) {
  const [state, action, pending] = useActionState(generatePending, {});
  return (
    <Card>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Tus reglas</h2>
        <form action={action}>
          <button disabled={pending} className="btn btn-secondary">
            {pending ? "Procesando…" : "Procesar pendientes"}
          </button>
        </form>
      </div>
      {state.error && <FormAlert tone="error">{state.error}</FormAlert>}
      {state.ok && <FormAlert tone="success">{state.message}</FormAlert>}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {rules.map((r) => (
          <RuleRow key={r.id} rule={r} />
        ))}
        {!rules.length && (
          <p className="muted py-10 text-center">
            Crea tu sueldo, alquiler o suscripción recurrente.
          </p>
        )}
      </div>
    </Card>
  );
}
function RuleRow({ rule: r }: { rule: DbRow<"recurring_rules"> }) {
  const [state, action, pending] = useActionState(toggleRecurring, {});
  return (
    <div className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={"/movimientos/recurrentes?editar=" + r.id}
            className="text-sm font-semibold text-blue-600"
          >
            {r.description}
          </Link>
          <p className="mt-2 text-xs text-slate-400">
            {
              { weekly: "Semanal", monthly: "Mensual", yearly: "Anual" }[
                r.frequency
              ]
            }{" "}
            · próxima: {r.next_run_on}
          </p>
        </div>
        <div className="text-right">
          <p className="mb-2 text-sm font-semibold tabular-nums">
            {formatCents(r.amount_cents)}
          </p>
          <Badge tone={r.is_active ? "success" : "muted"}>
            {r.is_active ? "Activa" : "Pausada"}
          </Badge>
        </div>
      </div>
      {r.last_error && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-600 dark:bg-red-950/30">
          No se pudo generar: {r.last_error}
        </p>
      )}
      <form action={action} className="mt-3">
        <input type="hidden" name="id" value={r.id} />
        <input type="hidden" name="active" value={String(!r.is_active)} />
        <button disabled={pending} className="btn btn-ghost text-xs">
          {r.is_active ? "Pausar" : "Reactivar y recuperar pendientes"}
        </button>
        {state.error && <FormAlert tone="error">{state.error}</FormAlert>}
      </form>
    </div>
  );
}
