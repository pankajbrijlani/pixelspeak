import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { buildPremiereXml } from "@/lib/montage/premiere-xml";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const userId = await requireUserId();

  const project = await prisma.montageProject.findFirst({ where: { id: projectId, userId } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const segments = await prisma.montageSegment.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
    include: { asset: true },
  });

  if (segments.length === 0) {
    return NextResponse.json({ error: "No segments to export — generate the montage first" }, { status: 400 });
  }

  const xml = buildPremiereXml(
    project.name,
    segments.map((s) => ({
      type: s.type,
      inSec: s.inSec,
      outSec: s.outSec,
      speed: s.speed,
      asset: { originalName: s.asset.originalName, storagePath: s.asset.storagePath },
    })),
  );

  const filename = `${project.name.replace(/[^a-z0-9 _-]/gi, "").trim() || "montage"}.xml`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
