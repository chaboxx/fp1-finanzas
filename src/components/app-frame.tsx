import Link from "next/link";
import { Sidebar, BottomNav } from "@/app/(app)/nav";
import { Icon } from "./icons";
import { BrandMark } from "./brand-mark";
export function AppFrame({
  children,
  userMenu,
  quickAction,
}: {
  children: React.ReactNode;
  userMenu: React.ReactNode;
  quickAction?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="lg:pl-60">
        <header className="flex min-h-20 items-center justify-between gap-3 border-b border-slate-200/70 px-5 sm:px-9 dark:border-slate-800">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold lg:hidden"
          >
            <BrandMark size={32} />
            <span>
              finanzas<span className="text-blue-600">.</span>
            </span>
          </Link>
          <span className="hidden text-xs text-slate-400 lg:block">
            FINANZAS PERSONALES <span className="mx-2">/</span> Mi espacio
          </span>
          <div className="ml-auto flex items-center gap-4">
            {quickAction ?? (
              <Link
                href="/movimientos/nuevo"
                aria-label="Nuevo movimiento"
                title="Nuevo movimiento"
                className="btn btn-primary size-11 p-0"
              >
                <Icon name="plus" />
              </Link>
            )}
            {userMenu}
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] px-4 pt-7 pb-24 sm:px-9 sm:pt-9 lg:pb-12">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
