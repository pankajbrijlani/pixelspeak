import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { streamFile } from "@/lib/montage/stream-file";

export async function GET(req: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const userId = await requireUserId();

  const asset = await prisma.montageAsset.findFirst({
    where: { id: assetId, project: { userId } },
  });
  if (!asset) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return streamFile(req, asset.storagePath, path.extname(asset.storagePath).toLowerCase());
}
