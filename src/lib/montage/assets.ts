import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { assetPath, safeExt } from "./storage";

const VIDEO_EXTS = new Set([".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"]);
// Raw source footage (a single long clip, high-bitrate 4K/drone footage,
// etc.) can legitimately run several gigabytes; this just guards against
// something absurd rather than realistically-sized raw footage.
export const MAX_ASSET_FILE_BYTES = 8 * 1024 * 1024 * 1024;

export type SaveAssetResult =
  | { ok: true; id: string; originalName: string }
  | { ok: false; name: string; reason: string };

export interface PlannedAsset {
  id: string;
  type: "VIDEO" | "PHOTO";
  destination: string;
}

/** Resolves where a new asset's file should live, or null if the name's extension isn't supported. */
export function planMontageAsset(projectId: string, originalName: string): PlannedAsset | null {
  const ext = safeExt(originalName);
  if (!ext) return null;
  const id = randomUUID();
  return {
    id,
    type: VIDEO_EXTS.has(ext) ? "VIDEO" : "PHOTO",
    destination: assetPath(projectId, id, ext),
  };
}

export async function createMontageAssetRecord(params: {
  id: string;
  projectId: string;
  type: "VIDEO" | "PHOTO";
  originalName: string;
  destination: string;
  mimeType: string | null;
  captureOrder: number;
}) {
  await prisma.montageAsset.create({
    data: {
      id: params.id,
      projectId: params.projectId,
      type: params.type,
      originalName: params.originalName,
      storagePath: params.destination,
      mimeType: params.mimeType,
      captureOrder: params.captureOrder,
      status: "PENDING",
    },
  });
}

/** Writes already-in-memory file bytes (browser upload) to disk and creates its MontageAsset row. */
export async function saveMontageAsset(
  projectId: string,
  originalName: string,
  bytes: Buffer,
  mimeType: string | null,
  captureOrder: number,
): Promise<SaveAssetResult> {
  const planned = planMontageAsset(projectId, originalName);
  if (!planned) {
    return { ok: false, name: originalName, reason: "Unsupported file type" };
  }
  if (bytes.byteLength > MAX_ASSET_FILE_BYTES) {
    return { ok: false, name: originalName, reason: `File too large (max ${MAX_ASSET_FILE_BYTES / 1024 ** 3}GB)` };
  }

  await writeFile(planned.destination, bytes);
  await createMontageAssetRecord({ ...planned, projectId, originalName, mimeType, captureOrder });

  return { ok: true, id: planned.id, originalName };
}
