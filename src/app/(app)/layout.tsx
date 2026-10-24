import { Suspense } from "react";
import { logout } from "@/app/(auth)/actions";
import { requireUser } from "@/lib/auth";
import { BottomNav, TopNav } from "./nav";

// Layout de todas las pantallas privadas: encabezado, navegación superior en
// escritorio y barra inferior en el celular.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-6 px-4">
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">Finanzas</span>
          <TopNav />
          <div className="ml-auto">
            <Suspense fallback={<span className="block h-8 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />}>
              <UserMenu />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pt-6 pb-24 sm:pb-10">{children}</main>
      <BottomNav />
    </div>
  );
}

async function UserMenu() {
  const { email } = await requireUser();
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden text-zinc-600 md:inline dark:text-zinc-400">{email}</span>
      <form action={logout}>
        <button
          type="submit"
          className="rounded-lg border border-zinc-300 px-3 py-1.5 font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Salir
        </button>
      </form>
    </div>
  );
}
