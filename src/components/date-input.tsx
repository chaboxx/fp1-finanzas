"use client";
import type { InputHTMLAttributes } from "react";

export function DateInput({
  type = "date",
  onClick,
  className = "field",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      type={type}
      className={"cursor-pointer " + className}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        // Se conserva el selector nativo y la entrada por teclado como alternativa.
        try {
          event.currentTarget.showPicker?.();
        } catch {
          // Algunos navegadores solo permiten abrirlo desde su icono nativo.
        }
      }}
    />
  );
}
