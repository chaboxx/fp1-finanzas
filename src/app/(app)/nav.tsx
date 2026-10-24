"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Agregar aquí las secciones nuevas de cada sprint.
const NAV_ITEMS = [
  { href: "/", label: "Inicio" },
  { href: "/cuentas", label: "Cuentas" },
  { href: "/categorias", label: "Categorías" },
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
}

export function TopNav() {
  const isActive = useIsActive();
  return (
    <nav className="hidden gap-1 sm:flex">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(item.href) ? "page" : undefined}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 aria-[current=page]:bg-emerald-50 aria-[current=page]:text-emerald-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:aria-[current=page]:bg-emerald-950 dark:aria-[current=page]:text-emerald-400"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const isActive = useIsActive();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-3 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden dark:border-zinc-800 dark:bg-zinc-900">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(item.href) ? "page" : undefined}
          className="py-3 text-center text-xs font-medium text-zinc-500 aria-[current=page]:text-emerald-700 dark:aria-[current=page]:text-emerald-400"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
