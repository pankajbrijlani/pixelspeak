import { mkdir } from "node:fs/promises";
import path from "node:path";

// Local-disk storage for uploaded footage and rendered output. Keeping this
// behind one module means swapping in S3/Blob storage later only touches
// this file, not every route that reads or writes montage media.
export const STORAGE_ROOT = path.join(process.cwd(), "storage", "montage");

export function projectDir(projectId: string) {
  return path.join(STORAGE_ROOT, projectId);
}

export function originalsDir(projectId: string) {
  return path.join(projectDir(projectId), "originals");
}

export function assetPath(projectId: string, assetId: string, ext: string) {
  return path.join(originalsDir(projectId), `${assetId}${ext}`);
}

export function thumbnailsDir(projectId: string) {
  return path.join(projectDir(projectId), "thumbnails");
}

export function thumbnailPath(projectId: string, assetId: string) {
  return path.join(thumbnailsDir(projectId), `${assetId}.jpg`);
}

export function outputPath(projectId: string) {
  return path.join(projectDir(projectId), "output.mp4");
}

export async function ensureProjectDirs(projectId: string) {
  await mkdir(originalsDir(projectId), { recursive: true });
  await mkdir(thumbnailsDir(projectId), { recursive: true });
}

export function safeExt(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  // Whitelist so we never write out an unexpected/executable extension.
  const allowed = [".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv", ".jpg", ".jpeg", ".png", ".webp", ".heic"];
  return allowed.includes(ext) ? ext : "";
}
