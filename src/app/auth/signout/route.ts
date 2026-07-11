import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Escape hatch for sessions with no matching profile row (or deactivated
// accounts): clear the session server-side, then land on the login page.
export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const response = NextResponse.redirect(new URL("/login", request.url));
  // Reset the 24h session clock so the next login starts fresh.
  response.cookies.delete("turkcure_session_start");
  return response;
}
