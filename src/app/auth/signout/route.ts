import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { INTRO_COOKIE, SESSION_START_COOKIE } from "@/lib/auth/cookies";

// The single sign-out path: clears the session server-side, then lands on the
// login page. Also the escape hatch for sessions with no matching profile row
// (or deactivated accounts). Used by the sidebar, the app layout, and the
// proxy's 24h-cap redirect.
export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const response = NextResponse.redirect(new URL("/login", request.url));
  // Reset the 24h session clock and replay the intro splash on next login.
  response.cookies.delete(SESSION_START_COOKIE);
  response.cookies.delete(INTRO_COOKIE);
  return response;
}
