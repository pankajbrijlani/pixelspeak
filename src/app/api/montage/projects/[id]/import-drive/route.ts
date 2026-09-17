import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { ensureProjectDirs, safeExt } from "@/lib/montage/storage";
import { createMontageAssetRecord, MAX_ASSET_FILE_BYTES, planMontageAsset } from "@/lib/montage/assets";
import {
  DriveAccessError,
  DriveFile,
  DriveFileTooLargeError,
  extForMimeType,
  getDriveFile,
  isImportable,
  listDriveFolderFiles,
  parseDriveLink,
  streamDriveFileToDisk,
} from "@/lib/montage/google-drive";

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

  const link = parseDriveLink(url);
  if (!link) {
    return NextResponse.json({ error: "That doesn't look like a Google Drive file or folder link" }, { status: 400 });
  }

  let files: DriveFile[] = [];
  let truncated = false;
  try {
    if (link.type === "folder") {
      ({ files, truncated } = await listDriveFolderFiles(link.id, apiKey));
    } else {
      const file = await getDriveFile(link.id, apiKey);
      if (isImportable(file.mimeType)) files = [file];
    }
  } catch (err) {
    if (err instanceof DriveAccessError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[montage] drive lookup failed", err);
    return NextResponse.json({ error: "Couldn't read that from Drive. Try again in a moment." }, { status: 502 });
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "No videos or photos found at that link" }, { status: 400 });
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

    const planned = planMontageAsset(projectId, name);
    if (!planned) {
      rejected.push({ name, reason: "Unsupported file type" });
      continue;
    }

    try {
      await streamDriveFileToDisk(file.id, apiKey, planned.destination, MAX_ASSET_FILE_BYTES);
      await createMontageAssetRecord({
        ...planned,
        projectId,
        originalName: name,
        mimeType: file.mimeType,
        captureOrder: existingCount + created.length + rejected.length,
      });
      created.push({ id: planned.id, originalName: name });
    } catch (err) {
      if (err instanceof DriveFileTooLargeError) {
        rejected.push({ name, reason: err.message });
      } else {
        console.error(`[montage] drive download failed for ${file.id}`, err);
        rejected.push({ name, reason: "Download failed" });
      }
    }
  }

  return NextResponse.json({ created, rejected, truncated });
}
