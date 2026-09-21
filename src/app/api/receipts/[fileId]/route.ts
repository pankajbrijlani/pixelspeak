import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getReceiptBytes } from "@/lib/drive";

// Proxies a receipt photo out of Drive. Requires a logged-in session
// rather than making files public — only the team can view receipts.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { fileId } = await params;

  try {
    const { bytes, mimeType } = await getReceiptBytes(fileId);
    return new NextResponse(new Blob([Buffer.from(bytes)], { type: mimeType }), {
      headers: { "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
