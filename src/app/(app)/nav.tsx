"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Icon, type IconName } from "@/components/icons";
const items: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Resumen", icon: "home" },
  { href: "/movimientos", label: "Movimientos", icon: "list" },
  { href: "/metricas", label: "Métricas", icon: "target" },
  { href: "/inversiones", label: "Inversiones", icon: "trend" },
  { href: "/presupuesto", label: "Presupuestos", icon: "budget" },
  { href: "/cuentas", label: "Cuentas", icon: "wallet" },
  { href: "/categorias", label: "Categorías", icon: "tag" },
  { href: "/perfil", label: "Perfil", icon: "user" },
];
export function Sidebar() {
  return (
    <Suspense>
      <Nav desktop />
    </Suspense>
  );
}
export function BottomNav() {
  return (
    <Suspense>
      <Nav />
    </Suspense>
  );
}
function Nav({ desktop = false }: { desktop?: boolean }) {
  const path = usePathname();
  const active = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href);
  if (desktop)
    return (
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-white px-5 py-7 lg:flex dark:border-slate-800 dark:bg-slate-950">
        <Link href="/" className="mb-12 flex items-center gap-3 px-2">
          <span className="flex size-10 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold text-white">
            f.
          </span>
          <span className="text-xl font-semibold tracking-tight">
            finanzas<span className="text-blue-600">.</span>
          </span>
        </Link>
        <p className="eyebrow mb-4 px-3">Mi organización</p>
        <nav aria-label="Principal" className="space-y-1.5">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active(item.href) ? "page" : undefined}
              className={
                "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition " +
                (active(item.href)
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900") +
                (item.href === "/categorias" ? " mt-7" : "")
              }
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
          <p className="text-xs font-semibold">
            Un poco de claridad, cada día.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Tus cuentas, planes e inversiones en un mismo lugar.
          </p>
        </div>
      </aside>
    );
  return (
    <nav
      aria-label="Principal móvil"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden dark:border-slate-800 dark:bg-slate-950"
    >
      {items.slice(0, 4).map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active(item.href) ? "page" : undefined}
          className={
            "flex min-h-16 flex-col items-center justify-center gap-1 text-[10px] font-medium " +
            (active(item.href) ? "text-blue-600" : "text-slate-400")
          }
        >
          <Icon name={item.icon} />
          {item.label}
        </Link>
      ))}
      <details className="relative">
        <summary className="flex min-h-16 list-none flex-col items-center justify-center gap-1 text-[10px] text-slate-500">
          <Icon name="more" />
          Más
        </summary>
        <div className="absolute right-2 bottom-20 w-48 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {items.slice(4).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg p-3 text-sm"
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          ))}
        </div>
      </details>
    </nav>
  );
}
