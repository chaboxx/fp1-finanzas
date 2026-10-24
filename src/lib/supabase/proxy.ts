import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rutas accesibles sin sesión.
const PUBLIC_PATHS = ["/login", "/signup", "/auth"];
// Rutas que no tiene sentido ver si ya iniciaste sesión.
const GUEST_ONLY_PATHS = ["/login", "/signup"];

// Refresca el token de Supabase en cada navegación y protege las rutas privadas.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // getClaims() valida la firma del JWT; no confiar en getSession() en el servidor.
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!isLoggedIn && !isPublic) {
    return redirectPreservingCookies(request, response, "/login");
  }
  if (isLoggedIn && GUEST_ONLY_PATHS.some((p) => pathname.startsWith(p))) {
    return redirectPreservingCookies(request, response, "/");
  }

  return response;
}

// Un redirect es una respuesta nueva: hay que copiarle las cookies de sesión
// que Supabase pudo haber refrescado, o el usuario perdería la sesión.
function redirectPreservingCookies(request: NextRequest, response: NextResponse, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
