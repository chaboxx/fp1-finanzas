export function parsePercentage(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return 0;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return bps <= 10000 ? bps : null;
}
// Truncar cada asignación nunca compromete más que el total. El residuo se muestra.
export function allocateCents(total: number, bps: number) {
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    !Number.isInteger(bps) ||
    bps < 0 ||
    bps > 10000
  )
    return 0;
  return Number((BigInt(total) * BigInt(bps)) / BigInt(10000));
}
