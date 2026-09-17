import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { assetPath, safeExt } from "./storage";

const VIDEO_EXTS = new Set([".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"]);
// Raw source footage (a single long clip, high-bitrate 4K, etc.) can
// legitimately be multi-gigabyte; this just guards against something
// absurd rather than realistically-sized raw footage.
export const MAX_ASSET_FILE_BYTES = 4 * 1024 * 1024 * 1024;

export type SaveAssetResult =
  | { ok: true; id: string; originalName: string }
  | { ok: false; name: string; reason: string };

/** Writes uploaded/imported file bytes to disk and creates its MontageAsset row. */
export async function saveMontageAsset(
  projectId: string,
  originalName: string,
  bytes: Buffer,
  mimeType: string | null,
  captureOrder: number,
): Promise<SaveAssetResult> {
  const ext = safeExt(originalName);
  if (!ext) {
    return { ok: false, name: originalName, reason: "Unsupported file type" };
  }
  if (bytes.byteLength > MAX_ASSET_FILE_BYTES) {
    return { ok: false, name: originalName, reason: "File too large (max 500MB)" };
  }

  const assetId = randomUUID();
  const type = VIDEO_EXTS.has(ext) ? "VIDEO" : "PHOTO";
  const destination = assetPath(projectId, assetId, ext);
  await writeFile(destination, bytes);

  await prisma.montageAsset.create({
    data: {
      id: assetId,
      projectId,
      type,
      originalName,
      storagePath: destination,
      mimeType,
      captureOrder,
      status: "PENDING",
    },
  });

  return { ok: true, id: assetId, originalName };
}
