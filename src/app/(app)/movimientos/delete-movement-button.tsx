"use client";
import { useActionState } from "react";
import { deleteMovement } from "./actions";
import { Icon } from "@/components/icons";
export function DeleteMovementButton({
  id,
  description = "este movimiento",
}: {
  id: string;
  description?: string;
}) {
  const [state, action, pending] = useActionState(deleteMovement, {});
  return (
    <details className="relative">
      <summary
        aria-label="Opciones del movimiento"
        className="btn btn-ghost min-h-11 list-none px-2"
      >
        <Icon name="more" size={18} />
      </summary>
      <div className="absolute right-0 z-20 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <form
          action={action}
          onSubmit={(e) => {
            if (
              !confirm(
                "¿Eliminar " +
                  description +
                  "? Se actualizarán tus saldos y métricas. No se puede deshacer.",
              )
            )
              e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button disabled={pending} className="btn w-full text-red-600">
            {pending ? "Eliminando…" : "Eliminar movimiento"}
          </button>
          {state.error && (
            <p role="alert" className="px-2 pb-2 text-xs text-red-600">
              {state.error}
            </p>
          )}
        </form>
      </div>
    </details>
  );
}
