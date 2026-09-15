import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { assetPath, ensureProjectDirs, safeExt } from "@/lib/montage/storage";

const VIDEO_TYPES = new Set([".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"]);
const MAX_FILE_BYTES = 500 * 1024 * 1024;

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
    const ext = safeExt(file.name);
    if (!ext) {
      rejected.push({ name: file.name, reason: "Unsupported file type" });
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      rejected.push({ name: file.name, reason: "File too large (max 500MB)" });
      continue;
    }

    const assetId = randomUUID();
    const type = VIDEO_TYPES.has(ext) ? "VIDEO" : "PHOTO";
    const destination = assetPath(projectId, assetId, ext);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(destination, buffer);

    await prisma.montageAsset.create({
      data: {
        id: assetId,
        projectId,
        type,
        originalName: file.name,
        storagePath: destination,
        mimeType: file.type || null,
        captureOrder: existingCount + i,
        status: "PENDING",
      },
    });

    created.push({ id: assetId, originalName: file.name });
  }

  return NextResponse.json({ created, rejected });
}
