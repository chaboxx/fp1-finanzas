"use client";

import { deleteMovement } from "./actions";

export function DeleteMovementButton({ id }: { id: string }) {
  return (
    <form
      action={deleteMovement}
      onSubmit={(e) => {
        if (!confirm("¿Borrar este movimiento? No se puede deshacer.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        aria-label="Borrar movimiento"
        className="flex size-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
      >
        ✕
      </button>
    </form>
  );
}
