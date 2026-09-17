import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { ensureProjectDirs, safeExt } from "@/lib/montage/storage";
import { saveMontageAsset } from "@/lib/montage/assets";
import { DriveAccessError, downloadDriveFile, extForMimeType, listDriveFolderFiles, parseDriveFolderId } from "@/lib/montage/google-drive";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const userId = await requireUserId();

  const project = await prisma.montageProject.findFirst({ where: { id: projectId, userId } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Drive import isn't configured on this server (missing GOOGLE_DRIVE_API_KEY)." },
      { status: 400 },
    );
  }

  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url) {
    return NextResponse.json({ error: "Paste a Google Drive folder link" }, { status: 400 });
  }

  const folderId = parseDriveFolderId(url);
  if (!folderId) {
    return NextResponse.json({ error: "That doesn't look like a Google Drive folder link" }, { status: 400 });
  }

  let files, truncated;
  try {
    ({ files, truncated } = await listDriveFolderFiles(folderId, apiKey));
  } catch (err) {
    if (err instanceof DriveAccessError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[montage] drive list failed", err);
    return NextResponse.json({ error: "Couldn't read that Drive folder. Try again in a moment." }, { status: 502 });
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "No videos or photos found in that folder" }, { status: 400 });
  }

  await ensureProjectDirs(projectId);
  const existingCount = await prisma.montageAsset.count({ where: { projectId } });

  const created: { id: string; originalName: string }[] = [];
  const rejected: { name: string; reason: string }[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    let name = file.name;
    if (!safeExt(name)) {
      const inferredExt = extForMimeType(file.mimeType);
      if (!inferredExt) {
        rejected.push({ name, reason: "Unsupported file type" });
        continue;
      }
      name = `${name}${inferredExt}`;
    }

    try {
      const bytes = await downloadDriveFile(file.id, apiKey);
      const result = await saveMontageAsset(projectId, name, bytes, file.mimeType, existingCount + created.length + rejected.length);
      if (result.ok) {
        created.push({ id: result.id, originalName: result.originalName });
      } else {
        rejected.push({ name: result.name, reason: result.reason });
      }
    } catch (err) {
      console.error(`[montage] drive download failed for ${file.id}`, err);
      rejected.push({ name, reason: "Download failed" });
    }
  }

  return NextResponse.json({ created, rejected, truncated });
}
