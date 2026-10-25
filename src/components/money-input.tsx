"use client";

import { useEffect, useRef, type InputHTMLAttributes } from "react";
import { centsToInput, parseToCents } from "@/lib/money";

// Se permiten estados intermedios al escribir; el servidor valida el monto final.
const editableAmount = /^\d*(?:\.\d{0,2})?$/;

export function MoneyInput({
  value,
  defaultValue,
  onChange,
  onBlur,
  onFocus,
  onPaste,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const accepted = useRef(String(value ?? defaultValue ?? ""));

  useEffect(() => {
    const input = inputRef.current;
    const form = input?.form;
    if (!input || !form) return;
    // También acompaña el reinicio nativo de los formularios con Server Actions.
    const reset = () => {
      accepted.current = input.defaultValue;
    };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, []);

  return (
    <input
      {...props}
      ref={inputRef}
      type="text"
      inputMode="decimal"
      pattern="[0-9]+([.][0-9]{0,2})?"
      title="Usa números sin signo y punto decimal. Ejemplo: 1500.50"
      value={value}
      defaultValue={defaultValue}
      onFocus={(event) => {
        accepted.current = event.currentTarget.value;
        onFocus?.(event);
      }}
      onPaste={(event) => {
        onPaste?.(event);
        const input = event.currentTarget;
        const next =
          input.value.slice(0, input.selectionStart ?? 0) +
          event.clipboardData.getData("text") +
          input.value.slice(input.selectionEnd ?? input.value.length);
        // Rechazar el pegado entero evita convertir por accidente -10 en 10.
        if (!editableAmount.test(next)) event.preventDefault();
      }}
      onChange={(event) => {
        const input = event.currentTarget;
        if (!editableAmount.test(input.value)) {
          input.value = String(value ?? accepted.current);
          return;
        }
        if (input.value.startsWith(".")) input.value = "0" + input.value;
        accepted.current = input.value;
        onChange?.(event);
      }}
      onBlur={(event) => {
        const input = event.currentTarget;
        const cents = parseToCents(input.value);
        if (cents !== null) {
          input.value = centsToInput(cents);
          accepted.current = input.value;
          onChange?.(event);
        }
        onBlur?.(event);
      }}
    />
  );
}
