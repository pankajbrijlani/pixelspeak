import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { streamFile } from "@/lib/montage/stream-file";

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const userId = await requireUserId();

  const project = await prisma.montageProject.findFirst({ where: { id: projectId, userId } });
  if (!project?.outputPath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return streamFile(req, project.outputPath, ".mp4");
}
