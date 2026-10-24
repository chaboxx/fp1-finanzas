import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión · Finanzas" };

export default function LoginPage() {
  return (
    // LoginForm lee ?error= de la URL: eso es un dato de request y va dentro de Suspense.
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
