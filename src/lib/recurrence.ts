import { addDays } from "./dashboard";
export type Frequency = "weekly" | "monthly" | "yearly";
export function recurrenceDate(
  start: string,
  frequency: Frequency,
  index: number,
) {
  if (frequency === "weekly") return addDays(start, index * 7);
  const original = new Date(start + "T12:00:00Z"),
    day = original.getUTCDate();
  const target = new Date(
    Date.UTC(
      original.getUTCFullYear(),
      original.getUTCMonth() + (frequency === "monthly" ? index : index * 12),
      1,
      12,
    ),
  );
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}
export function nextOccurrence(
  start: string,
  frequency: Frequency,
  cutoff: string,
) {
  let index = 0;
  while (recurrenceDate(start, frequency, index) < cutoff && index < 10000)
    index++;
  return { index, date: recurrenceDate(start, frequency, index) };
}
