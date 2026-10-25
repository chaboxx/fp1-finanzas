import { BrandMark } from "@/components/brand-mark";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-10 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-6 flex items-center justify-center gap-3">
          <BrandMark />
          <p className="text-lg font-semibold text-blue-700 dark:text-blue-400">
            Finanzas
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
