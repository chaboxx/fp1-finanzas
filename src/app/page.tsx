import { Suspense } from "react";
import { logout } from "@/app/(auth)/actions";
import { requireUser } from "@/lib/auth";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <span className="font-semibold text-emerald-700 dark:text-emerald-400">Finanzas</span>
        <Suspense fallback={<span className="h-8 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />}>
          <UserMenu />
        </Suspense>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-2xl font-semibold">Bienvenido</h1>
        <p className="text-zinc-500">El dashboard llega en el Sprint 4.</p>
      </main>
    </div>
  );
}

async function UserMenu() {
  const { email } = await requireUser();
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden text-zinc-600 sm:inline dark:text-zinc-400">{email}</span>
      <form action={logout}>
        <button
          type="submit"
          className="rounded-lg border border-zinc-300 px-3 py-1.5 font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
