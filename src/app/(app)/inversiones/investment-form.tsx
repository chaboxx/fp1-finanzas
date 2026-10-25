"use client";
import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import { FormAlert, FormField, SubmitButton } from "@/components/form-field";
import { Card } from "@/components/ui";
import { RequiredMark } from "@/components/required-mark";
import type { Account, Category } from "@/lib/types";
import type { DbRow } from "@/lib/finance-data";
import {
  centsToInput,
  CURRENCIES,
  CURRENCY_LABEL,
  CURRENCY_SYMBOL,
  type Currency,
} from "@/lib/money";
import { useCloseModal } from "@/components/form-modal";
import {
  saveInvestment,
  setInvestmentActive,
  updateInvestment,
} from "./actions";
type Operation = "invest" | "divest" | "valuation" | "opening";
export function InvestmentForm({
  investments,
  accounts,
  categories,
  defaultAccountId,
  editing,
  initialOperation,
}: {
  investments: DbRow<"investments">[];
  accounts: Account[];
  categories: Category[];
  defaultAccountId: string | null;
  editing?: DbRow<"transactions">;
  initialOperation?: Operation;
}) {
  const closeModal = useCloseModal();
  const [operation, setOperation] = useState<Operation>(
      (editing?.type as Operation) ?? initialOperation ?? "invest",
    ),
    [selected, setSelected] = useState(editing?.investment_id ?? "");
  const [amount, setAmount] = useState(
      editing ? centsToInput(editing.amount_cents) : "",
    ),
    [description, setDescription] = useState(editing?.description ?? "");
  const request = useRef<string | null>(null),
    [, startTransition] = useTransition();
  const [state, action, pending] = useActionState(
    async (prev: import("@/lib/action-state").ActionState, fd: FormData) => {
      const r = await saveInvestment(prev, fd);
      if (r.ok) {
        closeModal?.();
        request.current = null;
        setAmount("");
        setDescription("");
      }
      return r;
    },
    {},
  );
  const defaultAccount = accounts.find((a) => a.id === defaultAccountId);
  // La moneda es de la inversión: elegirla filtra posiciones y cuentas.
  const [currency, setCurrency] = useState<Currency>(
    investments.find((i) => i.id === editing?.investment_id)?.currency ?? "PEN",
  );
  const currencies = CURRENCIES.filter(
    (c) =>
      accounts.some((a) => a.currency === c) ||
      investments.some((i) => i.currency === c),
  );
  const defaultFits = defaultAccount?.currency === currency,
    money = ["invest", "divest"].includes(operation),
    newPosition =
      operation === "opening" || (operation === "invest" && !selected);
  return (
    <Card>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">
          {editing ? "Editar movimiento de inversión" : "Registra tu inversión"}
        </h2>
        {editing && (
          <Link href="/inversiones" className="text-xs text-blue-600">
            Cancelar edición
          </Link>
        )}
      </div>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          request.current ??= crypto.randomUUID();
          const fd = new FormData(e.currentTarget);
          fd.set("requestId", request.current);
          startTransition(() => action(fd));
        }}
        className="space-y-5"
      >
        <input type="hidden" name="entryId" value={editing?.id ?? ""} />
        <input type="hidden" name="operation" value={operation} />
        <input type="hidden" name="currency" value={currency} />
        {currencies.length > 1 && !editing && (
          <div className="segmented" aria-label="Moneda">
            {currencies.map((c) => (
              <button
                key={c}
                type="button"
                className="segment"
                aria-pressed={currency === c}
                onClick={() => {
                  setCurrency(c);
                  if (
                    investments.find((i) => i.id === selected)?.currency !== c
                  )
                    setSelected("");
                }}
              >
                {CURRENCY_LABEL[c]} ({CURRENCY_SYMBOL[c]})
              </button>
            ))}
          </div>
        )}
        <div className="segmented" aria-label="Operación de inversión">
          {(
            [
              ["invest", "Aportar"],
              ["divest", "Rescatar"],
              ["valuation", "Actualizar valor"],
              ["opening", "Saldo inicial"],
            ] as const
          )
            .filter(([v]) => !editing || v === editing.type)
            .map(([v, l]) => (
              <button
                key={v}
                type="button"
                className="segment"
                aria-pressed={operation === v}
                onClick={() => {
                  setOperation(v);
                  if (v === "opening") setSelected("");
                }}
              >
                {l}
              </button>
            ))}
        </div>
        {state.error && <FormAlert tone="error">{state.error}</FormAlert>}
        {state.fieldErrors && (
          <FormAlert tone="error">
            Revisa los campos; usa una fecha y nombres válidos.
          </FormAlert>
        )}
        {state.ok && <FormAlert tone="success">{state.message}</FormAlert>}
        <div className="grid gap-4 sm:grid-cols-2">
          {operation !== "opening" ? (
            <label className="text-xs font-medium text-slate-500">
              Inversión{operation !== "invest" && <RequiredMark />}
              <select
                className="field mt-1.5"
                name="investmentId"
                required={operation !== "invest"}
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                disabled={!!editing}
              >
                <option value="">
                  {operation === "invest"
                    ? "Nueva / por categoría"
                    : "Selecciona una inversión"}
                </option>
                {investments
                  .filter((i) => i.is_active || i.id === editing?.investment_id)
                  .filter((i) => i.currency === currency)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
              </select>
              {editing && (
                <input type="hidden" name="investmentId" value={selected} />
              )}
            </label>
          ) : (
            <input type="hidden" name="investmentId" value="" />
          )}
          {newPosition ? (
            <label className="text-xs font-medium text-slate-500">
              Categoría
              <RequiredMark />
              <select className="field mt-1.5" name="categoryId" required>
                <option value="">Selecciona</option>
                {categories
                  .filter((c) => c.kind === "investment" && c.is_active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="categoryId" value="" />
          )}
          {newPosition ? (
            <>
              <FormField label="Nombre" name="name" maxLength={60} />
              <FormField
                label="Plataforma"
                name="platform"
                placeholder="Tu broker o banco"
                maxLength={100}
              />
            </>
          ) : (
            <>
              <input type="hidden" name="name" value="" />
              <input type="hidden" name="platform" value="" />
            </>
          )}
          <FormField
            label={
              (operation === "valuation" || operation === "opening"
                ? "Valor informado"
                : "Monto") + ` (${CURRENCY_SYMBOL[currency]})`
            }
            name="amount"
            money
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            required
          />
          <FormField
            label="Fecha"
            name="date"
            type="date"
            defaultValue={editing?.occurred_on}
          />
          {money ? (
            <label className="text-xs font-medium text-slate-500">
              {operation === "invest"
                ? "Cuenta de origen"
                : "Cuenta que recibe"}
              {!defaultFits && <RequiredMark />}
              <select
                key={currency}
                className="field mt-1.5"
                name="accountId"
                required={!defaultFits}
                defaultValue={editing?.account_id ?? ""}
              >
                <option value="">
                  {defaultFits
                    ? "Por defecto: " + defaultAccount.name
                    : "Elige una cuenta en " +
                      CURRENCY_LABEL[currency].toLowerCase()}
                </option>
                {accounts
                  .filter((a) => a.is_active || a.id === editing?.account_id)
                  .filter((a) => a.currency === currency)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="accountId" value="" />
          )}
          {operation === "opening" ? (
            <FormField
              label="Capital aportado antes de usar la app"
              name="initialCapital"
              money
              inputMode="decimal"
            />
          ) : (
            <input type="hidden" name="initialCapital" value="" />
          )}
        </div>
        <FormField
          label="Descripción"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={140}
          placeholder={operation === "invest" ? "Aporte mensual" : "Referencia"}
        />
        <p className="rounded-xl bg-blue-50 p-3 text-xs leading-relaxed text-blue-700 dark:bg-blue-950 dark:text-blue-300">
          {operation === "opening"
            ? "Registra una inversión que ya tenías. No descuenta dinero de una cuenta. Si desconoces su capital inicial, no se calculará su resultado."
            : operation === "valuation"
              ? "Actualizar el valor no crea un aporte ni cambia el saldo de tus cuentas. Si ya informaste un valor ese día, se reemplaza."
              : operation === "invest"
                ? currency === "PEN"
                  ? "El aporte se descuenta una sola vez y cuenta como egreso y ejecución de tu presupuesto de inversión."
                  : "El aporte se descuenta una sola vez de tu cuenta en dólares y se ve en el Resumen en dólares. El presupuesto es en soles: no lo consume."
                : "El rescate suma a tu cuenta y se muestra separado de ingresos ordinarios. No repone el presupuesto consumido."}
        </p>
        <div className="sm:w-64">
          <SubmitButton pending={pending}>
            {editing
              ? "Guardar cambios"
              : operation === "valuation"
                ? "Actualizar valor"
                : operation === "opening"
                  ? "Registrar saldo inicial"
                  : "Guardar movimiento"}
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}
export function InvestmentSettings({
  investment,
}: {
  investment: DbRow<"investments">;
}) {
  const [state, action, pending] = useActionState(updateInvestment, {}),
    [toggle, toggleAction, toggling] = useActionState(setInvestmentActive, {});
  return (
    <details className="mt-3">
      <summary className="text-xs text-slate-400">
        Editar / {investment.is_active ? "deshabilitar" : "reactivar"}
      </summary>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="id" value={investment.id} />
        <FormField
          label="Nombre"
          name="name"
          defaultValue={investment.name}
          required
        />
        <FormField
          label="Plataforma"
          name="platform"
          defaultValue={investment.platform ?? ""}
        />
        {state.error && <FormAlert tone="error">{state.error}</FormAlert>}
        <SubmitButton pending={pending}>Guardar datos</SubmitButton>
      </form>
      <form action={toggleAction} className="mt-3">
        <input type="hidden" name="id" value={investment.id} />
        <input
          type="hidden"
          name="active"
          value={String(!investment.is_active)}
        />
        <button
          disabled={toggling}
          className="btn btn-ghost w-full"
          type="submit"
        >
          {investment.is_active
            ? "Deshabilitar inversión"
            : "Reactivar inversión"}
        </button>
        {toggle.error && <FormAlert tone="error">{toggle.error}</FormAlert>}
      </form>
    </details>
  );
}
