import { NextRequest, NextResponse } from "next/server";
import { processDueEnrollments } from "@/lib/campaign-engine";

// Called on a schedule (e.g. Vercel Cron, or any external scheduler) to send
// whatever campaign steps are currently due. Protect with CRON_SECRET so
// this can't be triggered by anyone who finds the URL.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processDueEnrollments();
  return NextResponse.json(result);
}
