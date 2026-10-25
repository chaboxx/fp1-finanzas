"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormModal, useCloseModal } from "@/components/form-modal";
import { MovementForm } from "../movimientos/movement-form";
import { Icon } from "@/components/icons";
import { FormAlert, FormField, SubmitButton } from "@/components/form-field";
import { Badge, Button, Card, SelectField } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";
import {
  centsToInput,
  CURRENCIES,
  CURRENCY_LABEL,
  CURRENCY_SYMBOL,
  formatCents,
  type Currency,
} from "@/lib/money";
import {
  ACCOUNT_TYPE_LABELS,
  type AccountType,
  type AccountWithBalance,
} from "@/lib/types";
import {
  createAccount,
  setAccountActive,
  setDefaultAccount,
  updateAccount,
} from "./actions";

export function CreateAccountForm({
  onCreated,
}: { onCreated?: () => void } = {}) {
  const closeModal = useCloseModal();
  const [type, setType] = useState<AccountType>("cash");
  const [currency, setCurrency] = useState<Currency>("PEN");
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await createAccount(prev, formData);
      if (result.ok) {
        setType("cash");
        setCurrency("PEN");
        onCreated?.();
        closeModal?.();
      }
      return result;
    },
    {},
  );

  return (
    <Card>
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        {!closeModal && <h2 className="font-semibold">Nueva cuenta</h2>}
        {state.error && <FormAlert tone="error">{state.error}</FormAlert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Nombre"
            name="name"
            placeholder="BCP Débito"
            maxLength={60}
            defaultValue={state.values?.name}
            error={state.fieldErrors?.name}
            required
          />
          <SelectField
            label="Tipo"
            name="type"
            required
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
          >
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <CurrencySelect value={currency} onChange={setCurrency} />
          <FormField
            label={
              (type === "credit" ? "Deuda actual" : "Saldo inicial") +
              ` (${CURRENCY_SYMBOL[currency]})`
            }
            name="initialBalance"
            money
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={state.values?.initialBalance}
            error={state.fieldErrors?.initialBalance}
          />
        </div>
        <div className="sm:w-48">
          <SubmitButton pending={pending}>Crear cuenta</SubmitButton>
        </div>
      </form>
    </Card>
  );
}

export function AccountList({
  accounts,
  defaultAccountId,
  allAccounts = accounts,
}: {
  allAccounts?: AccountWithBalance[];
  accounts: AccountWithBalance[];
  defaultAccountId: string | null;
}) {
  return (
    <ul aria-label="Cuentas" className="flex flex-col gap-4">
      {accounts.map((account) => (
        <AccountRow
          key={account.id}
          account={account}
          transferAccounts={allAccounts}
          defaultAccountId={defaultAccountId}
          isDefault={account.id === defaultAccountId}
        />
      ))}
    </ul>
  );
}

function AccountRow({
  account,
  isDefault,
  transferAccounts,
  defaultAccountId,
}: {
  transferAccounts: AccountWithBalance[];
  defaultAccountId: string | null;
  account: AccountWithBalance;
  isDefault: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [toggleState, toggleAction, togglePending] = useActionState(
    setAccountActive,
    {} as ActionState,
  );
  const [defaultState, defaultAction, defaultPending] = useActionState(
    setDefaultAccount,
    {} as ActionState,
  );
  const isCredit = account.type === "credit";
  const error = toggleState.error ?? defaultState.error;

  if (editing) {
    return (
      <li className="panel">
        <EditAccountForm account={account} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li
      className={`panel flex flex-col gap-4 ${account.is_active ? "" : "opacity-60"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
            <Icon
              name={account.type === "cash" ? "wallet" : "bank"}
              size={21}
            />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={"/movimientos?cuenta=" + account.id}
                className="truncate font-semibold hover:text-blue-600"
              >
                {account.name}
              </Link>
              {isDefault && <Badge tone="success">Por defecto</Badge>}
              {!account.is_active && <Badge tone="muted">Deshabilitada</Badge>}
              {account.currency !== "PEN" && (
                <Badge tone="muted">{CURRENCY_LABEL[account.currency]}</Badge>
              )}
            </div>
            <p className="text-sm text-zinc-500">
              {ACCOUNT_TYPE_LABELS[account.type]}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p
            className={`font-semibold tabular-nums ${account.balance_cents < 0 ? "text-red-600" : ""}`}
          >
            {formatCents(
              isCredit
                ? Math.abs(account.balance_cents)
                : account.balance_cents,
              account.currency,
            )}
          </p>
          {isCredit && (
            <p className="text-xs text-zinc-500">
              {account.balance_cents < 0 ? "deuda" : "a favor"}
            </p>
          )}
        </div>
      </div>

      {error && <FormAlert tone="error">{error}</FormAlert>}

      <div className="flex flex-wrap items-center gap-2">
        {account.is_active && (
          <FormModal
            title="Transferir entre cuentas"
            triggerLabel="Transferir"
            variant="secondary"
          >
            <MovementForm
              accounts={transferAccounts}
              categories={[]}
              defaultAccountId={defaultAccountId}
              initialType="transfer"
              onlyType="transfer"
              initialAccount={account.id}
            />
          </FormModal>
        )}
        <Link
          href={"/movimientos?cuenta=" + account.id}
          className="btn btn-ghost"
        >
          Ver movimientos
        </Link>
        <details className="relative ml-auto">
          <summary
            className="btn btn-ghost list-none"
            aria-label={"Opciones de " + account.name}
          >
            <Icon name="more" />
          </summary>
          <div className="absolute right-0 z-10 flex w-52 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <Button type="button" onClick={() => setEditing(true)}>
              Editar
            </Button>
            {account.is_active && !isDefault && (
              <form action={defaultAction}>
                <input type="hidden" name="id" value={account.id} />
                <Button type="submit" disabled={defaultPending}>
                  Usar por defecto
                </Button>
              </form>
            )}
            {!isDefault && (
              <form action={toggleAction}>
                <input type="hidden" name="id" value={account.id} />
                <input
                  type="hidden"
                  name="active"
                  value={String(!account.is_active)}
                />
                <Button type="submit" variant="ghost" disabled={togglePending}>
                  {account.is_active ? "Deshabilitar" : "Habilitar"}
                </Button>
              </form>
            )}
          </div>
        </details>
      </div>
    </li>
  );
}

export function AccountsWorkspace({
  accounts,
  defaultAccountId,
}: {
  accounts: AccountWithBalance[];
  defaultAccountId: string | null;
}) {
  const [filter, setFilter] = useState("active");
  const visible = accounts.filter(
    (a) =>
      filter === "all" || (filter === "active" ? a.is_active : !a.is_active),
  );
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="segmented" aria-label="Estado de cuentas">
          {[
            ["active", "Activas"],
            ["all", "Todas"],
            ["inactive", "Deshabilitadas"],
          ].map(([v, l]) => (
            <button
              key={v}
              className="segment"
              aria-pressed={filter === v}
              onClick={() => setFilter(v)}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <FormModal
            title="Transferir entre cuentas"
            triggerLabel="Transferir entre cuentas"
            variant="secondary"
          >
            <MovementForm
              accounts={accounts}
              categories={[]}
              defaultAccountId={defaultAccountId}
              initialType="transfer"
              onlyType="transfer"
            />
          </FormModal>
          <FormModal title="Nueva cuenta" triggerLabel="Crear cuenta">
            <CreateAccountForm />
          </FormModal>
        </div>
      </div>
      {visible.length ? (
        <AccountList
          accounts={visible}
          allAccounts={accounts}
          defaultAccountId={defaultAccountId}
        />
      ) : (
        <Card className="py-12 text-center">
          <h2 className="font-semibold">Sin cuentas en esta vista</h2>
          <p className="muted mt-2">Crea una cuenta para empezar.</p>
        </Card>
      )}
    </div>
  );
}

function EditAccountForm({
  account,
  onDone,
}: {
  account: AccountWithBalance;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await updateAccount(prev, formData);
      if (result.ok) onDone();
      return result;
    },
    {},
  );
  const isCredit = account.type === "credit";
  const [currency, setCurrency] = useState<Currency>(
    (state.values?.currency as Currency | undefined) ?? account.currency,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={account.id} />
      {state.error && <FormAlert tone="error">{state.error}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          label="Nombre"
          name="name"
          defaultValue={state.values?.name ?? account.name}
          maxLength={60}
          error={state.fieldErrors?.name}
          required
        />
        <CurrencySelect value={currency} onChange={setCurrency} />
        <FormField
          label={
            (isCredit ? "Deuda inicial" : "Saldo inicial") +
            ` (${CURRENCY_SYMBOL[currency]})`
          }
          name="initialBalance"
          money
          inputMode="decimal"
          defaultValue={
            state.values?.initialBalance ??
            centsToInput(
              isCredit
                ? -account.initial_balance_cents
                : account.initial_balance_cents,
            )
          }
          error={state.fieldErrors?.initialBalance}
        />
      </div>
      <p className="text-xs text-zinc-500">
        El saldo actual se calcula a partir del saldo inicial más tus
        movimientos. La moneda solo se puede cambiar si la cuenta aún no tiene
        movimientos.
      </p>
      <div className="flex gap-2">
        <div className="w-32">
          <SubmitButton pending={pending}>Guardar</SubmitButton>
        </div>
        <Button type="button" variant="ghost" className="h-11" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function CurrencySelect({
  value,
  onChange,
}: {
  value: Currency;
  onChange: (value: Currency) => void;
}) {
  return (
    <SelectField
      label="Moneda"
      name="currency"
      required
      value={value}
      onChange={(e) => onChange(e.target.value as Currency)}
    >
      {CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {CURRENCY_LABEL[c]} ({CURRENCY_SYMBOL[c]})
        </option>
      ))}
    </SelectField>
  );
}
