"use client";

import { useActionState, useState } from "react";
import { FormAlert, FormField, SubmitButton } from "@/components/form-field";
import { Badge, Button, Card } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";
import { CATEGORY_PALETTE } from "@/lib/colors";
import { CATEGORY_COLORS, CATEGORY_KIND_LABELS, type Category, type CategoryKind } from "@/lib/types";
import { createCategory, setCategoryActive, updateCategory } from "./actions";

const KINDS = Object.keys(CATEGORY_KIND_LABELS) as CategoryKind[];

export function CategoriesManager({ categories }: { categories: Category[] }) {
  const [kind, setKind] = useState<CategoryKind>("expense");
  const visible = categories.filter((c) => c.kind === kind);

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-200/60 p-1 dark:bg-zinc-800">
        {KINDS.map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={k === kind}
            onClick={() => setKind(k)}
            className="rounded-lg py-2 text-sm font-medium text-zinc-600 transition aria-selected:bg-white aria-selected:text-zinc-900 aria-selected:shadow-sm dark:text-zinc-400 dark:aria-selected:bg-zinc-900 dark:aria-selected:text-zinc-100"
          >
            {CATEGORY_KIND_LABELS[k]}
            <span className="ml-1 text-xs text-zinc-400">{categories.filter((c) => c.kind === k && c.is_active).length}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-500">
            No tienes categorías de {CATEGORY_KIND_LABELS[kind].toLowerCase()}. Crea la primera abajo.
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {visible.map((category) => (
              <CategoryRow key={category.id} category={category} />
            ))}
          </ul>
        </Card>
      )}

      <CreateCategoryForm key={kind} kind={kind} usedColors={visible.map((c) => c.color)} />
    </div>
  );
}

function CreateCategoryForm({ kind, usedColors }: { kind: CategoryKind; usedColors: (string | null)[] }) {
  // Si el usuario no eligió color, se sugiere el primero que aún no se usa en esta sección.
  const [pickedColor, setPickedColor] = useState<string | null>(null);
  const suggested = CATEGORY_COLORS.find((c) => !usedColors.includes(c)) ?? CATEGORY_COLORS[0];
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await createCategory(prev, formData);
    if (result.ok) setPickedColor(null);
    return result;
  }, {});

  return (
    <Card>
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <h2 className="font-semibold">Nueva categoría de {CATEGORY_KIND_LABELS[kind].toLowerCase()}</h2>
        {state.error && <FormAlert tone="error">{state.error}</FormAlert>}
        <input type="hidden" name="kind" value={kind} />
        <FormField
          label="Nombre"
          name="name"
          placeholder={kind === "expense" ? "Comida" : kind === "income" ? "Sueldo" : "Fondos mutuos"}
          maxLength={40}
          defaultValue={state.values?.name}
          error={state.fieldErrors?.name}
          required
        />
        <ColorPicker value={pickedColor ?? suggested} onChange={setPickedColor} />
        <div className="sm:w-48">
          <SubmitButton pending={pending}>Crear categoría</SubmitButton>
        </div>
      </form>
    </Card>
  );
}

function CategoryRow({ category }: { category: Category }) {
  const [editing, setEditing] = useState(false);
  const [state, toggleAction, pending] = useActionState(setCategoryActive, {} as ActionState);

  if (editing) {
    return (
      <li className="p-4">
        <EditCategoryForm category={category} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className={`flex flex-col gap-2 p-4 ${category.is_active ? "" : "opacity-60"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: category.color ?? "#a1a1aa" }} />
          <span className="truncate font-medium">{category.name}</span>
          {!category.is_active && <Badge tone="muted">Deshabilitada</Badge>}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" onClick={() => setEditing(true)}>
            Editar
          </Button>
          <form action={toggleAction}>
            <input type="hidden" name="id" value={category.id} />
            <input type="hidden" name="active" value={String(!category.is_active)} />
            <Button type="submit" variant="ghost" disabled={pending}>
              {category.is_active ? "Deshabilitar" : "Habilitar"}
            </Button>
          </form>
        </div>
      </div>
      {state.error && <FormAlert tone="error">{state.error}</FormAlert>}
    </li>
  );
}

function EditCategoryForm({ category, onDone }: { category: Category; onDone: () => void }) {
  const [color, setColor] = useState(category.color ?? CATEGORY_COLORS[0]);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await updateCategory(prev, formData);
    if (result.ok) onDone();
    return result;
  }, {});

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={category.id} />
      {state.error && <FormAlert tone="error">{state.error}</FormAlert>}
      <FormField label="Nombre" name="name" defaultValue={state.values?.name ?? category.name} maxLength={40} error={state.fieldErrors?.name} required />
      <ColorPicker value={color} onChange={setColor} />
      <p className="text-xs text-zinc-500">El nombre nuevo también se verá en los movimientos anteriores.</p>
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

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">Color</legend>
      <input type="hidden" name="color" value={value} />
      <div className="flex flex-wrap gap-2">
        {CATEGORY_PALETTE.map(({ light: c, name }) => (
          <button
            key={c}
            type="button"
            aria-label={name}
            title={name}
            aria-pressed={c === value}
            onClick={() => onChange(c)}
            className="size-8 rounded-full ring-offset-2 transition aria-pressed:ring-2 aria-pressed:ring-zinc-900 dark:ring-offset-zinc-900 dark:aria-pressed:ring-zinc-100"
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </fieldset>
  );
}
