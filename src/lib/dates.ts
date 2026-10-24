// Todas las fechas de movimientos son "días" (YYYY-MM-DD) en hora de Lima.
export const TIME_ZONE = "America/Lima";

// "2026-10-24" según el reloj de Lima, no el del servidor (UTC).
export function todayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

export function currentMonth(): string {
  return todayISO().slice(0, 7);
}

export function isMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

// "2026-10" => { from: "2026-10-01", to: "2026-11-01" } (to es exclusivo)
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const next =
    m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { from: `${month}-01`, to: `${next}-01` };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

// Se fija la hora a mediodía UTC para que ninguna zona horaria cambie el día.
function toDate(isoDay: string) {
  return new Date(`${isoDay}T12:00:00Z`);
}

export function formatMonth(month: string): string {
  const label = toDate(`${month}-01`).toLocaleDateString("es-PE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatDayHeading(isoDay: string): string {
  if (isoDay === todayISO()) return "Hoy";
  const label = toDate(isoDay).toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
