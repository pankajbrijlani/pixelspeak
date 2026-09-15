import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { runMontagePipeline } from "@/lib/montage/pipeline";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const userId = await requireUserId();

  const project = await prisma.montageProject.findFirst({ where: { id: projectId, userId } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const assetCount = await prisma.montageAsset.count({ where: { projectId } });
  if (assetCount === 0) {
    return NextResponse.json({ error: "Upload at least one video or photo first" }, { status: 400 });
  }

  if (project.status === "ANALYZING" || project.status === "RENDERING") {
    return NextResponse.json({ error: "A render is already in progress" }, { status: 409 });
  }

  await prisma.montageProject.update({ where: { id: projectId }, data: { status: "ANALYZING", errorMessage: null } });

  // Runs after the response is sent, in the same process, so the request
  // returns immediately while analysis + rendering continue in the
  // background. The client polls the project's status endpoint for progress.
  after(() => runMontagePipeline(projectId));

  return NextResponse.json({ status: "ANALYZING" }, { status: 202 });
}
