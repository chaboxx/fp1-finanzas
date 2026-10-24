const formatter = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  minimumFractionDigits: 2,
});

// 150050 => "S/ 1,500.50"
export function formatCents(cents: number): string {
  return formatter.format(cents / 100);
}

// Convierte lo que escribe el usuario a céntimos. Acepta "1500", "1,500.50",
// "1500.5", "S/ 20" y también coma decimal ("15,50"). Devuelve null si no es válido.
export function parseToCents(input: string): number | null {
  let s = input.replace(/s\/|\s/gi, "");
  if (s === "") return null;

  if (s.includes(",") && s.includes(".")) {
    if (!/^-?\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) return null;
    s = s.replace(/,/g, ""); // 1,500.50
  } else if (/^-?\d+,\d{1,2}$/.test(s)) {
    s = s.replace(",", "."); // 15,50
  } else {
    if (s.includes(",") && !/^-?\d{1,3}(,\d{3})+$/.test(s)) return null;
    s = s.replace(/,/g, ""); // 1,500
  }

  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  const negative = s.startsWith("-");
  const [whole, fraction = ""] = (negative ? s.slice(1) : s).split(".");
  const integer = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  const result = Number(negative ? -integer : integer);
  return Number.isSafeInteger(result) ? result : null;
}

// Para precargar inputs: 150050 => "1500.50"
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
