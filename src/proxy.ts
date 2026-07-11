import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Project ref → the auth cookie name Supabase uses is `sb-<ref>-auth-token`.
const PROJECT_REF = (() => {
  try {
    return new URL(SUPABASE_URL).hostname.split(".")[0];
  } catch {
    return "";
  }
})();

/**
 * Decode (without verifying) the access-token JWT that supabase-ssr stores in
 * the auth cookie(s), and return its `exp` in seconds. supabase-ssr may chunk
 * the cookie into `...auth-token.0`, `.1`, … so we concatenate those. The stored
 * value is JSON (often prefixed with `base64-`) whose `access_token` is a JWT.
 */
function readTokenExp(request: NextRequest): number | null {
  const base = `sb-${PROJECT_REF}-auth-token`;
  const all = request.cookies.getAll();
  const parts = all
    .filter((c) => c.name === base || c.name.startsWith(`${base}.`))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => c.value);
  if (parts.length === 0) return null;

  try {
    let raw = parts.join("");
    if (raw.startsWith("base64-")) {
      raw = Buffer.from(raw.slice("base64-".length), "base64").toString("utf8");
    }
    const session = JSON.parse(raw);
    const accessToken: string | undefined = session?.access_token ?? session?.[0]?.access_token;
    if (!accessToken) return null;
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64").toString("utf8")
    );
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

// Sessions are capped at 24h: after that, users must sign in again.
const SESSION_START_COOKIE = "turkcure_session_start";
const MAX_SESSION_MS = 24 * 60 * 60 * 1000;

/**
 * Enforce the 24h session cap. Returns a redirect to the signout route when
 * the session is too old; otherwise stamps a start-time cookie if missing
 * (covers sessions created before this feature) and returns null.
 */
function enforceSessionAge(request: NextRequest, response: NextResponse): NextResponse | null {
  const started = Number(request.cookies.get(SESSION_START_COOKIE)?.value);
  if (Number.isFinite(started) && started > 0) {
    if (Date.now() - started > MAX_SESSION_MS) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/signout";
      return NextResponse.redirect(url);
    }
    return null;
  }
  response.cookies.set(SESSION_START_COOKIE, String(Date.now()), {
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
    sameSite: "lax",
  });
  return null;
}

export async function proxy(request: NextRequest) {
  const isLoginPage = request.nextUrl.pathname.startsWith("/login");
  const isSignoutRoute = request.nextUrl.pathname.startsWith("/auth/signout");
  const exp = readTokenExp(request);
  const now = Math.floor(Date.now() / 1000);
  // Treat a token with more than 5 minutes of life left as a valid session
  // without hitting the network. This is only a UX gate — real authorization
  // is enforced by requireProfile() in server components/actions and by RLS.
  const hasFreshSession = exp !== null && exp - now > 300;

  // Fast path: no auth-server round trip on the vast majority of requests.
  if (hasFreshSession) {
    if (isLoginPage) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    const next = NextResponse.next({ request });
    if (!isSignoutRoute) {
      const expired = enforceSessionAge(request, next);
      if (expired) return expired;
    }
    return next;
  }

  // No cookie at all and not on the login page → straight to login, still no
  // network call.
  if (exp === null && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Slow path: cookie exists but the token is missing/near expiry. Contact the
  // auth server to refresh it and persist the rotated cookies on the response.
  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  if (user && !isSignoutRoute) {
    const expired = enforceSessionAge(request, response);
    if (expired) return expired;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
