import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { syncOverduePaymentReminders } from "@/lib/data/overdue";

// Constant-time compare (length leak aside — lengths differ, it's not equal).
function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function GET(request: Request) {
  // Guard the unset case too: without it, a missing env var would make the
  // expected header the literal string "Bearer undefined" — trivially sendable.
  if (
    !process.env.CRON_SECRET ||
    !safeEqual(
      request.headers.get("authorization") ?? "",
      `Bearer ${process.env.CRON_SECRET}`
    )
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Surface the sweep's outcome in the cron log — a totally failed run used to
  // report { ok: true } and be indistinguishable from a clean one.
  const result = await syncOverduePaymentReminders();
  const ok = result.errors.length === 0;
  return NextResponse.json({ ok, ...result }, { status: ok ? 200 : 500 });
}
