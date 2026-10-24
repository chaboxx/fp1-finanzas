import { Suspense } from "react";
import { PageHeader, LoadingPanel } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ProfileForm } from "./profile-form";
export default function ProfilePage() {
  return (
    <>
      <PageHeader
        title="Tu perfil"
        description="Personaliza tu nombre y cómo quieres ver tus finanzas."
      />
      <Suspense fallback={<LoadingPanel />}>
        <Profile />
      </Suspense>
    </>
  );
}
async function Profile() {
  const { supabase, userId, email } = await requireUser(),
    { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
  if (error) throw new Error("No se pudo cargar el perfil");
  return (
    <ProfileForm
      email={email ?? ""}
      name={data.display_name ?? ""}
      preference={
        data.theme === "dark" || data.theme === "system" ? data.theme : "light"
      }
    />
  );
}
