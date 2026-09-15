import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const userId = await requireUserId();

  const project = await prisma.montageProject.findFirst({
    where: { id: projectId, userId },
    include: {
      assets: { select: { id: true, status: true, originalName: true, type: true } },
      _count: { select: { segments: true } },
    },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: project.status,
    errorMessage: project.errorMessage,
    hasOutput: Boolean(project.outputPath),
    assets: project.assets,
    segmentCount: project._count.segments,
  });
}
