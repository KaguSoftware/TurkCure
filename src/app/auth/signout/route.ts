import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Escape hatch for sessions with no matching profile row (or deactivated
// accounts): clear the session server-side, then land on the login page.
export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url));
}
