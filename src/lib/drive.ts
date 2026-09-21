import { google, drive_v3 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { createBareOAuthClient } from "@/lib/google";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

export class ReceiptUploadError extends Error {}

export const DRIVE_CONNECTION_ID = "singleton";
export const RECEIPTS_FOLDER_NAME = "Creative Sprouts Receipts";
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // 10MB

// Finds (or creates, on first connect) the shared receipts folder in the
// connected account's Drive.
export async function findOrCreateReceiptsFolder(client: InstanceType<typeof google.auth.OAuth2>) {
  const drive = google.drive({ version: "v3", auth: client });
  const existing = await drive.files.list({
    q: `name = '${RECEIPTS_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, webViewLink)",
    spaces: "drive",
  });
  const found = existing.data.files?.[0];
  if (found?.id) {
    return { folderId: found.id, folderUrl: found.webViewLink ?? null };
  }

  const created = await drive.files.create({
    requestBody: { name: RECEIPTS_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" },
    fields: "id, webViewLink",
  });
  if (!created.data.id) throw new Error("Could not create the Drive receipts folder");
  return { folderId: created.data.id, folderUrl: created.data.webViewLink ?? null };
}

async function getDriveClient(): Promise<{ drive: drive_v3.Drive; folderId: string }> {
  const connection = await prisma.driveConnection.findUnique({
    where: { id: DRIVE_CONNECTION_ID },
  });
  if (!connection) {
    throw new ReceiptUploadError(
      "Google Drive isn't connected yet. Go to Settings and connect it."
    );
  }

  const client = createBareOAuthClient();
  client.setCredentials({
    access_token: connection.accessToken ? decryptSecret(connection.accessToken) : undefined,
    refresh_token: decryptSecret(connection.refreshToken),
    expiry_date: connection.tokenExpiresAt?.getTime(),
  });

  // googleapis auto-refreshes the access token when it's expired; persist
  // the rotated token so we don't re-refresh on every request.
  client.on("tokens", (tokens) => {
    if (!tokens.access_token) return;
    prisma.driveConnection
      .update({
        where: { id: DRIVE_CONNECTION_ID },
        data: {
          accessToken: encryptSecret(tokens.access_token),
          tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        },
      })
      .catch(() => {});
  });

  return { drive: google.drive({ version: "v3", auth: client }), folderId: connection.folderId };
}

export async function uploadReceipt(file: File): Promise<{ url: string; pathname: string }> {
  if (!file.type.startsWith("image/")) {
    throw new ReceiptUploadError("Please upload a photo (JPG, PNG, HEIC, etc).");
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    throw new ReceiptUploadError("Photo is too large (10MB max).");
  }

  const { drive, folderId } = await getDriveClient();
  const { Readable } = await import("stream");
  const buffer = Buffer.from(await file.arrayBuffer());

  let created;
  try {
    created = await drive.files.create({
      requestBody: { name: `${Date.now()}-${file.name || "receipt"}`, parents: [folderId] },
      media: { mimeType: file.type, body: Readable.from(buffer) },
      fields: "id",
    });
  } catch {
    throw new ReceiptUploadError("Upload to Google Drive failed, try again.");
  }

  if (!created.data.id) {
    throw new ReceiptUploadError("Upload to Google Drive failed, try again.");
  }
  return { url: `/api/receipts/${created.data.id}`, pathname: created.data.id };
}

export async function deleteReceipt(fileId: string): Promise<void> {
  try {
    const { drive } = await getDriveClient();
    await drive.files.delete({ fileId });
  } catch {
    // best-effort: don't block the DB delete on a storage hiccup
  }
}

export async function getReceiptBytes(
  fileId: string
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const { drive } = await getDriveClient();
  const [meta, media] = await Promise.all([
    drive.files.get({ fileId, fields: "mimeType" }),
    drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" }),
  ]);
  return {
    bytes: new Uint8Array(media.data as ArrayBuffer),
    mimeType: meta.data.mimeType ?? "application/octet-stream",
  };
}
