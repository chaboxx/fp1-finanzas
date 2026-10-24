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
    s = s.replace(/,/g, ""); // 1,500.50
  } else if (/^\d+,\d{1,2}$/.test(s)) {
    s = s.replace(",", "."); // 15,50
  } else {
    s = s.replace(/,/g, ""); // 1,500
  }

  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

// Para precargar inputs: 150050 => "1500.50"
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
