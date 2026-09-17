import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { ensureProjectDirs } from "@/lib/montage/storage";
import { saveMontageAsset } from "@/lib/montage/assets";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const userId = await requireUserId();

  const project = await prisma.montageProject.findFirst({ where: { id: projectId, userId } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  await ensureProjectDirs(projectId);

  const existingCount = await prisma.montageAsset.count({ where: { projectId } });
  const created: { id: string; originalName: string }[] = [];
  const rejected: { name: string; reason: string }[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await saveMontageAsset(projectId, file.name, buffer, file.type || null, existingCount + i);
    if (result.ok) {
      created.push({ id: result.id, originalName: result.originalName });
    } else {
      rejected.push({ name: result.name, reason: result.reason });
    }
  }

  return NextResponse.json({ created, rejected });
}
