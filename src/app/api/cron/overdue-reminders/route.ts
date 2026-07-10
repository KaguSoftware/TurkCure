import { NextResponse } from "next/server";
import { syncOverduePaymentReminders } from "@/lib/data/overdue";

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await syncOverduePaymentReminders();
  return NextResponse.json({ ok: true });
}
