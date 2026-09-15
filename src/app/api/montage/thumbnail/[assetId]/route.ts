import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { thumbnailPath } from "@/lib/montage/storage";
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

  const thumb = thumbnailPath(asset.projectId, assetId);
  if (!existsSync(thumb)) {
    return NextResponse.json({ error: "No thumbnail yet" }, { status: 404 });
  }

  return streamFile(req, thumb, ".jpg");
}
