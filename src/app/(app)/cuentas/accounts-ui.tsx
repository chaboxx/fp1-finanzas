"use client";

import { useActionState, useState } from "react";
import { FormAlert, FormField, SubmitButton } from "@/components/form-field";
import { Badge, Button, Card, SelectField } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";
import { centsToInput, formatCents } from "@/lib/money";
import { ACCOUNT_TYPE_LABELS, type AccountType, type AccountWithBalance } from "@/lib/types";
import { createAccount, setAccountActive, setDefaultAccount, updateAccount } from "./actions";

export function CreateAccountForm() {
  const [type, setType] = useState<AccountType>("cash");
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await createAccount(prev, formData);
    if (result.ok) setType("cash");
    return result;
  }, {});

  return (
    <Card>
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <h2 className="font-semibold">Nueva cuenta</h2>
        {state.error && <FormAlert tone="error">{state.error}</FormAlert>}
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            label="Nombre"
            name="name"
            placeholder="BCP Débito"
            maxLength={60}
            defaultValue={state.values?.name}
            error={state.fieldErrors?.name}
            required
          />
          <SelectField label="Tipo" name="type" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <FormField
            label={type === "credit" ? "Deuda actual (S/)" : "Saldo inicial (S/)"}
            name="initialBalance"
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

export function AccountList({ accounts, defaultAccountId }: { accounts: AccountWithBalance[]; defaultAccountId: string | null }) {
  return (
    <Card className="p-0">
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {accounts.map((account) => (
          <AccountRow key={account.id} account={account} isDefault={account.id === defaultAccountId} />
        ))}
      </ul>
    </Card>
  );
}

function AccountRow({ account, isDefault }: { account: AccountWithBalance; isDefault: boolean }) {
  const [editing, setEditing] = useState(false);
  const [toggleState, toggleAction, togglePending] = useActionState(setAccountActive, {} as ActionState);
  const [defaultState, defaultAction, defaultPending] = useActionState(setDefaultAccount, {} as ActionState);
  const isCredit = account.type === "credit";
  const error = toggleState.error ?? defaultState.error;

  if (editing) {
    return (
      <li className="p-4">
        <EditAccountForm account={account} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className={`flex flex-col gap-3 p-4 ${account.is_active ? "" : "opacity-60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{account.name}</span>
            {isDefault && <Badge tone="success">Por defecto</Badge>}
            {!account.is_active && <Badge tone="muted">Deshabilitada</Badge>}
          </div>
          <p className="text-sm text-zinc-500">{ACCOUNT_TYPE_LABELS[account.type]}</p>
        </div>
        <div className="text-right">
          <p className={`font-semibold tabular-nums ${account.balance_cents < 0 ? "text-red-600" : ""}`}>
            {formatCents(isCredit ? Math.abs(account.balance_cents) : account.balance_cents)}
          </p>
          {isCredit && <p className="text-xs text-zinc-500">{account.balance_cents < 0 ? "deuda" : "a favor"}</p>}
        </div>
      </div>

      {error && <FormAlert tone="error">{error}</FormAlert>}

      <div className="flex flex-wrap gap-2">
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
            <input type="hidden" name="active" value={String(!account.is_active)} />
            <Button type="submit" variant="ghost" disabled={togglePending}>
              {account.is_active ? "Deshabilitar" : "Habilitar"}
            </Button>
          </form>
        )}
      </div>
    </li>
  );
}

function EditAccountForm({ account, onDone }: { account: AccountWithBalance; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await updateAccount(prev, formData);
    if (result.ok) onDone();
    return result;
  }, {});
  const isCredit = account.type === "credit";

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={account.id} />
      {state.error && <FormAlert tone="error">{state.error}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Nombre" name="name" defaultValue={state.values?.name ?? account.name} maxLength={60} error={state.fieldErrors?.name} required />
        <FormField
          label={isCredit ? "Deuda inicial (S/)" : "Saldo inicial (S/)"}
          name="initialBalance"
          inputMode="decimal"
          defaultValue={state.values?.initialBalance ?? centsToInput(Math.abs(account.initial_balance_cents))}
          error={state.fieldErrors?.initialBalance}
        />
      </div>
      <p className="text-xs text-zinc-500">
        El saldo actual se calcula a partir del saldo inicial más tus movimientos.
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
