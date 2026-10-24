"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { FormAlert, SubmitButton } from "@/components/form-field";
import { Card } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";
import { centsToInput } from "@/lib/money";
import type { Account, Category, Movement } from "@/lib/types";
import { saveMovement } from "./actions";
import { DescriptionCombobox, type Suggestion } from "./description-combobox";

type FormType = "expense" | "income" | "transfer";

const TYPES: { value: FormType; label: string }[] = [
  { value: "expense", label: "Gasto" },
  { value: "income", label: "Ingreso" },
  { value: "transfer", label: "Transferencia" },
];

type Props = {
  accounts: Account[];
  categories: Category[];
  defaultAccountId: string | null;
  movement?: Movement; // si viene, el formulario edita en vez de crear
};

export function MovementForm({ accounts, categories, defaultAccountId, movement }: Props) {
  const editing = Boolean(movement);
  const [type, setType] = useState<FormType>((movement?.type as FormType) ?? "expense");
  const [amount, setAmount] = useState(movement ? centsToInput(movement.amount_cents) : "");
  const [description, setDescription] = useState(movement?.description ?? "");
  const [categoryId, setCategoryId] = useState(movement?.category_id ?? "");
  const [accountId, setAccountId] = useState(movement?.account_id ?? "");
  const [toAccountId, setToAccountId] = useState(movement?.to_account_id ?? "");
  const [occurredOn, setOccurredOn] = useState(movement?.occurred_on ?? "");

  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await saveMovement(prev, formData);
    if (result.ok) {
      // Listo para registrar otro: se conservan tipo, cuenta y fecha.
      setAmount("");
      setDescription("");
      setCategoryId("");
    }
    return result;
  }, {});

  // Las deshabilitadas no se ofrecen, salvo la que ya tiene el movimiento que se edita.
  const usable = <T extends { id: string; is_active: boolean }>(items: T[], current?: string | null) =>
    items.filter((i) => i.is_active || i.id === current);
  const kindCategories = usable(categories, movement?.category_id).filter((c) => c.kind === type);
  const usableAccounts = usable(accounts, movement?.account_id).concat(
    accounts.filter((a) => !a.is_active && a.id === movement?.to_account_id),
  );
  const defaultAccount = accounts.find((a) => a.id === defaultAccountId);
  const errors = state.fieldErrors ?? {};

  function changeType(next: FormType) {
    setType(next);
    setCategoryId("");
    if (next === "transfer" && !accountId && defaultAccountId) setAccountId(defaultAccountId);
  }

  function applySuggestion(s: Suggestion) {
    setDescription(s.description);
    if (s.category_id && kindCategories.some((c) => c.id === s.category_id)) setCategoryId(s.category_id);
    if (s.account_id && usableAccounts.some((a) => a.id === s.account_id)) setAccountId(s.account_id);
    if (!amount) setAmount(centsToInput(Number(s.amount_cents)));
  }

  // onSubmit + startTransition en vez de <form action>: así React no resetea
  // el formulario solo (los campos son controlados y se limpian a mano al guardar).
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => formAction(formData));
  }

  if (accounts.length === 0 || categories.length === 0) {
    return (
      <Card>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Antes de registrar movimientos necesitas al menos una{" "}
          <Link href="/cuentas" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            cuenta
          </Link>{" "}
          y una{" "}
          <Link href="/categorias" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            categoría
          </Link>
          .
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {movement && <input type="hidden" name="id" value={movement.id} />}
        <input type="hidden" name="type" value={type} />

        <div role="radiogroup" aria-label="Tipo de movimiento" className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-200/60 p-1 dark:bg-zinc-800">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={type === t.value}
              onClick={() => changeType(t.value)}
              className="rounded-lg py-2 text-sm font-medium text-zinc-600 transition aria-checked:bg-white aria-checked:text-zinc-900 aria-checked:shadow-sm dark:text-zinc-400 dark:aria-checked:bg-zinc-900 dark:aria-checked:text-zinc-100"
            >
              {t.label}
            </button>
          ))}
        </div>

        {state.ok && state.message && <FormAlert tone="success">{state.message}</FormAlert>}
        {state.error && <FormAlert tone="error">{state.error}</FormAlert>}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="amount" className="text-sm font-medium">
            Monto
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lg text-zinc-500">S/</span>
            <input
              id="amount"
              name="amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              autoFocus={!editing}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={Boolean(errors.amount)}
              className="h-14 w-full rounded-lg border border-zinc-300 bg-white pr-3 pl-11 text-2xl font-semibold tabular-nums outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 aria-invalid:border-red-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          {errors.amount && <p className="text-sm text-red-600 dark:text-red-400">{errors.amount}</p>}
        </div>

        <DescriptionCombobox
          value={description}
          onChange={setDescription}
          onPick={applySuggestion}
          type={type}
          categoryName={(id) => categories.find((c) => c.id === id)?.name}
        />

        {type !== "transfer" && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Categoría</legend>
            {kindCategories.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No tienes categorías de {type === "expense" ? "gasto" : "ingreso"}.{" "}
                <Link href="/categorias" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                  Crear una
                </Link>
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {kindCategories.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 rounded-full border border-zinc-300 px-3 py-1.5 text-sm transition has-checked:border-emerald-600 has-checked:bg-emerald-50 has-checked:text-emerald-800 dark:border-zinc-700 dark:has-checked:bg-emerald-950 dark:has-checked:text-emerald-300"
                  >
                    <input
                      type="radio"
                      name="categoryId"
                      value={c.id}
                      checked={categoryId === c.id}
                      onChange={() => setCategoryId(c.id)}
                      className="sr-only"
                    />
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: c.color ?? "#a1a1aa" }} />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
            {errors.categoryId && <p className="text-sm text-red-600 dark:text-red-400">{errors.categoryId}</p>}
          </fieldset>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <AccountSelect
            name="accountId"
            label={type === "transfer" ? "Desde" : "Cuenta"}
            value={accountId}
            onChange={setAccountId}
            accounts={usableAccounts}
            emptyLabel={type === "transfer" ? "Elige una cuenta" : `Por defecto${defaultAccount ? ` (${defaultAccount.name})` : ""}`}
            error={errors.accountId}
          />
          {type === "transfer" ? (
            <AccountSelect
              name="toAccountId"
              label="Hacia"
              value={toAccountId}
              onChange={setToAccountId}
              accounts={usableAccounts.filter((a) => a.id !== accountId)}
              emptyLabel="Elige una cuenta"
              error={errors.toAccountId}
            />
          ) : null}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="occurredOn" className="text-sm font-medium">
              Fecha
            </label>
            <input
              id="occurredOn"
              name="occurredOn"
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
              className="h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <p className="text-xs text-zinc-500">{occurredOn ? "" : "Vacío = hoy"}</p>
            {errors.occurredOn && <p className="text-sm text-red-600 dark:text-red-400">{errors.occurredOn}</p>}
          </div>
        </div>

        {type === "transfer" && (
          <p className="text-xs text-zinc-500">
            Una transferencia mueve dinero entre tus cuentas (por ejemplo, pagar la tarjeta). No cuenta como gasto ni como ingreso.
          </p>
        )}

        <div className="flex items-center gap-3">
          <div className="w-40">
            <SubmitButton pending={pending}>{editing ? "Guardar cambios" : "Guardar"}</SubmitButton>
          </div>
          {editing && (
            <Link href="/movimientos" className="text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-400">
              Cancelar
            </Link>
          )}
        </div>
      </form>
    </Card>
  );
}

type AccountSelectProps = {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  accounts: Account[];
  emptyLabel: string;
  error?: string;
};

function AccountSelect({ name, label, value, onChange, accounts, emptyLabel, error }: AccountSelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={name}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        className="h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 aria-invalid:border-red-500 dark:border-zinc-700 dark:bg-zinc-900"
      >
        <option value="">{emptyLabel}</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
