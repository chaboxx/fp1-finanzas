import { Card } from "./ui";
import { Icon, type IconName } from "./icons";
import { formatCents } from "@/lib/money";
type Tone = "neutral" | "income" | "expense" | "investment" | "balance";
const tones: Record<Tone, { panel: string; icon: string; value: string }> = {
  neutral: {
    panel: "",
    icon: "bg-slate-50 text-slate-400 dark:bg-slate-800",
    value: "",
  },
  income: {
    panel:
      "border-emerald-100 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20",
    icon: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40",
    value: "text-emerald-700 dark:text-emerald-300",
  },
  expense: {
    panel:
      "border-rose-100 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/20",
    icon: "bg-rose-100 text-rose-600 dark:bg-rose-900/40",
    value: "text-rose-600 dark:text-rose-300",
  },
  investment: {
    panel:
      "border-violet-100 bg-violet-50/60 dark:border-violet-900 dark:bg-violet-950/20",
    icon: "bg-violet-100 text-violet-600 dark:bg-violet-900/40",
    value: "text-violet-700 dark:text-violet-300",
  },
  balance: {
    panel:
      "border-blue-100 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20",
    icon: "bg-blue-100 text-blue-600 dark:bg-blue-900/40",
    value: "text-blue-700 dark:text-blue-300",
  },
};
export function StatCard({
  label,
  value,
  icon = "wallet",
  delta,
  footnote,
  emphasis = false,
  tone,
}: {
  label: string;
  value: number;
  icon?: IconName;
  delta?: number | null;
  footnote?: string;
  emphasis?: boolean;
  tone?: Tone;
}) {
  const style = tones[tone ?? (emphasis ? "balance" : "neutral")];
  return (
    <Card className={style.panel}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {label}
        </span>
        <span
          className={
            "flex size-8 items-center justify-center rounded-lg " + style.icon
          }
        >
          <Icon name={icon} size={16} />
        </span>
      </div>
      <p
        className={
          "metric-value " +
          (value < 0 ? "text-rose-600 dark:text-rose-300" : style.value)
        }
      >
        {formatCents(value)}
      </p>
      {delta !== undefined && (
        <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
          {delta === null
            ? "Sin base de comparación"
            : (delta >= 0 ? "↑ " : "↓ ") +
              Math.abs(delta).toFixed(1) +
              " % frente al período anterior"}
        </p>
      )}
      {footnote && (
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          {footnote}
        </p>
      )}
    </Card>
  );
}
