import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-2xl font-semibold">Bienvenido</h1>
      <p className="text-zinc-500">El dashboard llega en el Sprint 4.</p>
      <p className="text-sm text-zinc-500">
        Mientras tanto, crea tus{" "}
        <Link href="/cuentas" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          cuentas
        </Link>{" "}
        y{" "}
        <Link href="/categorias" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          categorías
        </Link>
        .
      </p>
    </div>
  );
}
