export type Currency = "PEN" | "USD";

export const CURRENCIES: Currency[] = ["PEN", "USD"];

// "US$" en vez del "USD" de Intl: es como se escribe el dólar en Perú.
export const CURRENCY_SYMBOL: Record<Currency, string> = {
  PEN: "S/",
  USD: "US$",
};

export const CURRENCY_LABEL: Record<Currency, string> = {
  PEN: "Soles",
  USD: "Dólares",
};

// Moneda elegida en la URL (?moneda=USD); cualquier otro valor es soles.
export const currencyParam = (value: unknown): Currency =>
  value === "USD" ? "USD" : "PEN";

const number = new Intl.NumberFormat("es-PE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// 150050 => "S/ 1,500.50"; en dólares => "US$ 1,500.50"
export function formatCents(cents: number, currency: Currency = "PEN"): string {
  return (
    (cents < 0 ? "-" : "") +
    CURRENCY_SYMBOL[currency] +
    " " +
    number.format(Math.abs(cents) / 100)
  );
}

// Solo montos sin signo ni separadores de miles, con punto y hasta dos decimales.
export function parseToCents(input: string): number | null {
  if (!/^\d+(\.\d{0,2})?$/.test(input)) return null;
  const [whole, fraction = ""] = input.split(".");
  const integer = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  const result = Number(integer);
  return Number.isSafeInteger(result) ? result : null;
}

// Para precargar inputs: 150050 => "1500.50"
export function centsToInput(cents: number): string {
  const digits = Math.abs(cents).toString().padStart(3, "0");
  return `${cents < 0 ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
