import { NextResponse } from "next/server";
import { syncOverduePaymentReminders } from "@/lib/data/overdue";

export async function GET(request: Request) {
  // Guard the unset case too: without it, a missing env var would make the
  // expected header the literal string "Bearer undefined" — trivially sendable.
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await syncOverduePaymentReminders();
  return NextResponse.json({ ok: true });
}
