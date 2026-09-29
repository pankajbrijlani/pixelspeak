import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { savePremiereXml } from "@/lib/montage/premiere-xml";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const userId = await requireUserId();

  const project = await prisma.montageProject.findFirst({ where: { id: projectId, userId } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const segmentCount = await prisma.montageSegment.count({ where: { projectId } });
  if (segmentCount === 0) {
    return NextResponse.json({ error: "No segments to export — generate the montage first" }, { status: 400 });
  }

  // Regenerates on every request (cheap — it's just an XML string) so a
  // browser download always reflects the current segments, on top of the
  // copy the pipeline already saved into the project's local folder.
  const path = await savePremiereXml(projectId);
  const xml = await readFile(path, "utf-8");

  const filename = `${project.name.replace(/[^a-z0-9 _-]/gi, "").trim() || "montage"}.xml`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
