"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

// Agregar aquí las secciones nuevas de cada sprint.
const NAV_ITEMS = [
  { href: "/", label: "Inicio" },
  { href: "/movimientos", label: "Movimientos" },
  { href: "/cuentas", label: "Cuentas" },
  { href: "/categorias", label: "Categorías" },
];

// usePathname() es dato de la URL: en rutas dinámicas (/movimientos/[id]) debe ir
// dentro de Suspense. El fallback es la misma navegación sin la pestaña activa.
export function TopNav() {
  return (
    <Suspense fallback={<TopNavLinks pathname={null} />}>
      <TopNavWithPath />
    </Suspense>
  );
}

export function BottomNav() {
  return (
    <Suspense fallback={<BottomNavLinks pathname={null} />}>
      <BottomNavWithPath />
    </Suspense>
  );
}

function TopNavWithPath() {
  return <TopNavLinks pathname={usePathname()} />;
}

function BottomNavWithPath() {
  return <BottomNavLinks pathname={usePathname()} />;
}

function isActive(pathname: string | null, href: string) {
  if (pathname === null) return false;
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function TopNavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav className="hidden gap-1 sm:flex">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(pathname, item.href) ? "page" : undefined}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 aria-[current=page]:bg-emerald-50 aria-[current=page]:text-emerald-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:aria-[current=page]:bg-emerald-950 dark:aria-[current=page]:text-emerald-400"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function BottomNavLinks({ pathname }: { pathname: string | null }) {
  // Botón flotante para registrar rápido, salvo dentro del propio formulario.
  const showQuickAdd = pathname !== null && !pathname.startsWith("/movimientos/");
  return (
    <>
      {showQuickAdd && (
        <Link
          href="/movimientos/nuevo"
          aria-label="Nuevo movimiento"
          className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex size-14 items-center justify-center rounded-full bg-emerald-600 text-3xl text-white shadow-lg transition hover:bg-emerald-700 sm:hidden"
        >
          +
        </Link>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden dark:border-zinc-800 dark:bg-zinc-900">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className="py-3 text-center text-xs font-medium text-zinc-500 aria-[current=page]:text-emerald-700 dark:aria-[current=page]:text-emerald-400"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
