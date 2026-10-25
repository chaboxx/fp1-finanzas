const formatter = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  minimumFractionDigits: 2,
});

// 150050 => "S/ 1,500.50"
export function formatCents(cents: number): string {
  return formatter.format(cents / 100);
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
