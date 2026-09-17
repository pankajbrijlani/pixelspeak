// Public-folder Google Drive import. Deliberately API-key based rather than
// OAuth: an OAuth consent flow for Drive scopes needs Google app review and
// per-user token storage, which is a lot of machinery for "grab some clips
// from a shared folder." The tradeoff is the folder must be shared as
// "Anyone with the link" — documented to the user at the point of use.
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const MAX_FILES = 40;

const MIME_EXT: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/x-m4v": ".m4v",
  "video/webm": ".webm",
  "video/x-msvideo": ".avi",
  "video/x-matroska": ".mkv",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
};

export function parseDriveFolderId(url: string): string | null {
  const patterns = [/\/folders\/([a-zA-Z0-9_-]+)/, /[?&]id=([a-zA-Z0-9_-]+)/];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

export class DriveAccessError extends Error {}

export async function listDriveFolderFiles(folderId: string, apiKey: string): Promise<{ files: DriveFile[]; truncated: boolean }> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  let truncated = false;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      pageSize: "100",
      key: apiKey,
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${DRIVE_API}?${params.toString()}`);
    if (!res.ok) {
      if (res.status === 403 || res.status === 404) {
        throw new DriveAccessError(
          "Couldn't access that folder. Make sure it's shared as \"Anyone with the link can view.\"",
        );
      }
      throw new Error(`Google Drive API error: ${res.status} ${await res.text().catch(() => "")}`);
    }

    const data = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
    for (const f of data.files ?? []) {
      if (isImportable(f.mimeType)) {
        if (files.length >= MAX_FILES) {
          truncated = true;
          break;
        }
        files.push(f);
      }
    }
    pageToken = files.length >= MAX_FILES ? undefined : data.nextPageToken;
  } while (pageToken);

  return { files, truncated };
}

function isImportable(mimeType: string) {
  return mimeType.startsWith("video/") || mimeType.startsWith("image/");
}

export function extForMimeType(mimeType: string): string | null {
  return MIME_EXT[mimeType] ?? null;
}

export async function downloadDriveFile(fileId: string, apiKey: string): Promise<Buffer> {
  const res = await fetch(`${DRIVE_API}/${fileId}?alt=media&key=${apiKey}`);
  if (!res.ok) {
    throw new Error(`Failed to download file ${fileId}: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
