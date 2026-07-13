import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Only same-origin relative paths are allowed as a post-auth destination, so a
// crafted `next` can't turn this into an open redirect.
function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
}

/**
 * Server-side landing for email auth links. Supabase's recovery/confirm emails
 * point here; we verify the token (or exchange the PKCE code) using the
 * cookie-bound server client so the session is persisted in cookies before we
 * redirect. This replaces relying on the browser SDK to parse the URL, which
 * was racy for the password-recovery flow.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const supabase = await createClient();
  let ok = false;
  if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  const url = request.nextUrl.clone();
  url.search = "";
  if (ok) {
    url.pathname = next;
  } else {
    url.pathname = "/login";
    url.searchParams.set("error", "link_invalid");
  }
  return NextResponse.redirect(url);
}
