import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Destino del enlace del email de confirmación. Soporta los dos formatos:
//  - ?token_hash=...&type=email  (plantilla recomendada: funciona en cualquier dispositivo)
//  - ?code=...                   (plantilla por defecto, flujo PKCE: mismo navegador del registro)
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const supabase = await createClient();
  let ok = false;

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  const url = request.nextUrl.clone();
  url.search = "";
  if (ok) {
    url.pathname = "/";
  } else {
    url.pathname = "/login";
    url.searchParams.set("error", "enlace");
  }
  return NextResponse.redirect(url);
}
