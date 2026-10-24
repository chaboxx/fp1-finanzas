import { Suspense } from "react";
import Link from "next/link";
import { logout } from "@/app/(auth)/actions";
import { requireUser } from "@/lib/auth";
import { Icon } from "@/components/icons";
import { AppFrame } from "@/components/app-frame";
import { FormModal } from "@/components/form-modal";
import { ProfileTheme } from "@/components/theme-runtime";
import { getMovementFormOptions } from "@/lib/data";
import { MovementForm } from "./movimientos/movement-form";
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppFrame
      quickAction={
        <Suspense
          fallback={
            <span
              aria-label="Nuevo movimiento"
              className="btn btn-primary size-11 p-0 opacity-50"
            >
              <Icon name="plus" />
            </span>
          }
        >
          <QuickMovement />
        </Suspense>
      }
      userMenu={
        <Suspense>
          <UserMenu />
        </Suspense>
      }
    >
      {children}
    </AppFrame>
  );
}
async function UserMenu() {
  const { email, supabase, userId } = await requireUser();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  const theme =
    data?.theme === "dark" || data?.theme === "system" ? data.theme : "light";
  return (
    <div className="flex items-center gap-3">
      <ProfileTheme preference={theme} />
      <Link
        href="/perfil"
        aria-label="Abrir perfil"
        title={email}
        className="hidden size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold sm:flex dark:bg-slate-800"
      >
        {email?.slice(0, 2).toUpperCase()}
      </Link>
      <form action={logout}>
        <button className="btn btn-ghost px-2" aria-label="Cerrar sesión">
          <Icon name="logout" size={18} />
        </button>
      </form>
    </div>
  );
}
async function QuickMovement() {
  const { supabase, userId } = await requireUser(),
    options = await getMovementFormOptions(supabase, userId);
  return (
    <FormModal
      title="Nuevo movimiento"
      triggerLabel="Nuevo movimiento"
      triggerIcon={<Icon name="plus" />}
      className="size-11 p-0"
    >
      <MovementForm {...options} />
    </FormModal>
  );
}
