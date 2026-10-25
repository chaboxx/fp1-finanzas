import Link from "next/link";
import type { Params } from "@/lib/dashboard";
import {
  CURRENCIES,
  CURRENCY_LABEL,
  CURRENCY_SYMBOL,
  type Currency,
} from "@/lib/money";
import { queryString } from "@/lib/report-filters";

// Elige la moneda de las tarjetas y gráficos. Vive en la URL (?moneda=USD) como los
// demás filtros: se conserva al recargar, al volver atrás y al cambiar de período.
export function CurrencyToggle({
  params,
  current,
  basePath,
}: {
  params: Params;
  current: Currency;
  basePath: string;
}) {
  return (
    <nav className="segmented" aria-label="Moneda de los totales">
      {CURRENCIES.map((c) => (
        <Link
          key={c}
          scroll={false}
          aria-current={c === current ? "true" : undefined}
          href={
            basePath +
            "?" +
            queryString(params, { moneda: c === "PEN" ? null : c })
          }
          className={
            "segment " +
            (c === current
              ? "bg-white text-blue-700 shadow-sm dark:bg-slate-700 dark:text-blue-300"
              : "")
          }
        >
          {CURRENCY_LABEL[c]} ({CURRENCY_SYMBOL[c]})
        </Link>
      ))}
    </nav>
  );
}

// Encabezado de las tarjetas: en qué moneda están y el selector para cambiarla.
export function CurrencyHeading(props: {
  params: Params;
  current: Currency;
  basePath: string;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="eyebrow">
        En {CURRENCY_LABEL[props.current].toLowerCase()}
      </h2>
      <CurrencyToggle {...props} />
    </div>
  );
}
