import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7",
  "base64"
);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const event = await prisma.emailEvent.findUnique({ where: { id } });
    if (event && event.type === "SENT") {
      await prisma.emailEvent.create({
        data: {
          campaignId: event.campaignId,
          stepId: event.stepId,
          leadId: event.leadId,
          type: "OPENED",
        },
      });
    }
  } catch (err) {
    console.error("Failed to record open event", err);
  }

  return new NextResponse(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
