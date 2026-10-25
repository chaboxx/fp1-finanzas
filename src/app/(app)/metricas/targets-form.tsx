"use client";

import { useActionState } from "react";
import { FormAlert, FormField, SubmitButton } from "@/components/form-field";
import { useCloseModal } from "@/components/form-modal";
import type { ActionState } from "@/lib/action-state";
import { formatMonth } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import type { Targets } from "@/lib/metrics";
import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/types";
import { saveTargets } from "./actions";

type AccountOption = { id: string; name: string; type: AccountType; in_emergency_fund: boolean };

export function TargetsForm({ month, targets, accounts }: { month: string; targets: Targets; accounts: AccountOption[] }) {
  const closeModal = useCloseModal();
  const [state, action, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await saveTargets(prev, formData);
    if (result.ok) closeModal?.();
    return result;
  }, {});
  const errors = state.fieldErrors ?? {};
  const liquidAccounts = accounts.filter((a) => a.type !== "credit");

  return (
    <form action={action} className="flex flex-col gap-5 p-5" noValidate>
      <input type="hidden" name="month" value={month} />
      <p className="muted">
        Valen desde <strong>{formatMonth(month)}</strong> en adelante. Los meses anteriores se siguen evaluando con las metas que
        tenían.
      </p>
      {state.error && <FormAlert tone="error">{state.error}</FormAlert>}

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          label="Ahorro mínimo (% de ingresos)"
          name="savingsRate"
          inputMode="decimal"
          defaultValue={state.values?.savingsRate ?? String(targets.savingsRateBps / 100)}
          error={errors.savingsRate}
        />
        <FormField
          label="Inversión mensual (S/)"
          name="monthlyInvestment"
          money
          inputMode="decimal"
          placeholder="0 = sin meta"
          defaultValue={
            state.values?.monthlyInvestment ??
            (targets.monthlyInvestmentCents ? centsToInput(targets.monthlyInvestmentCents) : "")
          }
          error={errors.monthlyInvestment}
        />
        <FormField
          label="Fondo de emergencia (meses)"
          name="emergencyMonths"
          inputMode="numeric"
          defaultValue={state.values?.emergencyMonths ?? String(targets.emergencyMonths)}
          error={errors.emergencyMonths}
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Cuentas que cuentan como fondo de emergencia</legend>
        <p className="muted -mt-1 mb-1">Dinero que podrías usar ya. Las tarjetas de crédito no cuentan.</p>
        {liquidAccounts.length === 0 ? (
          <p className="muted">Aún no tienes cuentas de efectivo, débito o ahorro.</p>
        ) : (
          liquidAccounts.map((a) => (
            <label key={a.id} className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-3 dark:border-slate-700">
              <input type="checkbox" name="emergencyAccount" value={a.id} defaultChecked={a.in_emergency_fund} className="size-4" />
              <span className="font-medium">{a.name}</span>
              <span className="muted ml-auto text-xs">{ACCOUNT_TYPE_LABELS[a.type]}</span>
            </label>
          ))
        )}
      </fieldset>

      <SubmitButton pending={pending}>Guardar metas</SubmitButton>
    </form>
  );
}
