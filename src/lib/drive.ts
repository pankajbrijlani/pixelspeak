import { google, drive_v3 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/prisma";
import { createBareOAuthClient } from "@/lib/google";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import type { DriveConnection } from "@prisma/client";

export class ReceiptUploadError extends Error {}

export const DRIVE_CONNECTION_ID = "singleton";
export const RECEIPTS_FOLDER_NAME = "Creative Sprouts Receipts";
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // 10MB

// Finds (or creates, on first connect) the shared receipts folder in the
// connected account's Drive. Root-level, so it's searched by name alone
// (no parent yet — this runs before any DriveConnection row exists).
export async function findOrCreateReceiptsFolder(client: OAuth2Client) {
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

async function findOrCreateSubfolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string
): Promise<string> {
  const escaped = name.replace(/'/g, "\\'");
  const existing = await drive.files.list({
    q: `name = '${escaped}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
    spaces: "drive",
  });
  const found = existing.data.files?.[0];
  if (found?.id) return found.id;

  const created = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
  });
  if (!created.data.id) throw new Error(`Could not create Drive folder "${name}"`);
  return created.data.id;
}

type DriveContext = { drive: drive_v3.Drive; connection: DriveConnection };

async function getDriveContext(): Promise<DriveContext> {
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

  return { drive: google.drive({ version: "v3", auth: client }), connection };
}

// Resolves the Drive folder a category's receipts belong in, creating the
// subfolder (named after the category) under the root on first use.
async function resolveCategoryFolderId(
  ctx: DriveContext,
  categoryId: string | null
): Promise<string> {
  if (!categoryId) return ctx.connection.folderId;

  const category = await prisma.expenseCategory.findUnique({ where: { id: categoryId } });
  if (!category) return ctx.connection.folderId;
  if (category.driveFolderId) return category.driveFolderId;

  const folderId = await findOrCreateSubfolder(ctx.drive, ctx.connection.folderId, category.name);
  await prisma.expenseCategory.update({ where: { id: categoryId }, data: { driveFolderId: folderId } });
  return folderId;
}

// Best-effort: makes sure a category has a matching Drive subfolder. Called
// right after a category is created so it's ready for drag-and-drop drops
// immediately, not just lazily on first app upload/sync. No-ops quietly if
// Drive isn't connected — the folder gets created lazily later instead.
export async function ensureCategoryDriveFolder(categoryId: string): Promise<void> {
  try {
    const ctx = await getDriveContext();
    await resolveCategoryFolderId(ctx, categoryId);
  } catch {
    // not connected, or a transient Drive API error — fine either way
  }
}

// Best-effort: keeps a category's Drive subfolder name in sync when it's
// renamed in the app, so the folder she drops receipts into still matches.
export async function renameCategoryDriveFolder(categoryId: string, newName: string): Promise<void> {
  try {
    const ctx = await getDriveContext();
    const category = await prisma.expenseCategory.findUnique({ where: { id: categoryId } });
    if (category?.driveFolderId) {
      await ctx.drive.files.update({ fileId: category.driveFolderId, requestBody: { name: newName } });
    }
  } catch {
    // best-effort
  }
}

// Best-effort: on first Drive connect, create a subfolder for every
// category that doesn't have one yet (e.g. categories created before Drive
// was connected).
export async function backfillCategoryFolders(): Promise<void> {
  try {
    const ctx = await getDriveContext();
    const categories = await prisma.expenseCategory.findMany({ where: { driveFolderId: null } });
    for (const category of categories) {
      const folderId = await findOrCreateSubfolder(ctx.drive, ctx.connection.folderId, category.name);
      await prisma.expenseCategory.update({ where: { id: category.id }, data: { driveFolderId: folderId } });
    }
  } catch {
    // best-effort
  }
}

export async function uploadReceipt(
  file: File,
  categoryId: string | null
): Promise<{ url: string; pathname: string }> {
  if (!file.type.startsWith("image/")) {
    throw new ReceiptUploadError("Please upload a photo (JPG, PNG, HEIC, etc).");
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    throw new ReceiptUploadError("Photo is too large (10MB max).");
  }

  const ctx = await getDriveContext();
  const folderId = await resolveCategoryFolderId(ctx, categoryId);
  const { Readable } = await import("stream");
  const buffer = Buffer.from(await file.arrayBuffer());

  let created;
  try {
    created = await ctx.drive.files.create({
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

// Best-effort: moves a receipt's file into a (possibly new) category's
// folder, so the Drive layout keeps matching the category in the app.
export async function moveReceiptToCategoryFolder(
  fileId: string,
  categoryId: string | null
): Promise<void> {
  try {
    const ctx = await getDriveContext();
    const targetFolderId = await resolveCategoryFolderId(ctx, categoryId);
    const meta = await ctx.drive.files.get({ fileId, fields: "parents" });
    const previousParents = (meta.data.parents ?? []).join(",");
    await ctx.drive.files.update({
      fileId,
      addParents: targetFolderId,
      removeParents: previousParents || undefined,
    });
  } catch {
    // best-effort
  }
}

export async function deleteReceipt(fileId: string): Promise<void> {
  try {
    const { drive } = await getDriveContext();
    await drive.files.delete({ fileId });
  } catch {
    // best-effort: don't block the DB delete on a storage hiccup
  }
}

export async function getReceiptBytes(
  fileId: string
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const { drive } = await getDriveContext();
  const [meta, media] = await Promise.all([
    drive.files.get({ fileId, fields: "mimeType" }),
    drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" }),
  ]);
  return {
    bytes: new Uint8Array(media.data as ArrayBuffer),
    mimeType: meta.data.mimeType ?? "application/octet-stream",
  };
}

export type DriveSyncResult = { imported: number };

// Scans every category's Drive subfolder for photos that aren't already an
// Expense (matched by Drive file id), and creates "needs review" expense
// records for the new ones — categorized by whichever folder they were
// found in. Safe to call often; already-imported files are skipped.
export async function syncReceiptsFromDrive(triggeredById: string): Promise<DriveSyncResult> {
  let drive: drive_v3.Drive;
  try {
    ({ drive } = await getDriveContext());
  } catch {
    return { imported: 0 };
  }

  const categories = await prisma.expenseCategory.findMany({
    where: { driveFolderId: { not: null } },
  });
  if (categories.length === 0) return { imported: 0 };

  const perCategoryFiles = await Promise.all(
    categories.map(async (category) => {
      const res = await drive.files.list({
        q: `'${category.driveFolderId}' in parents and trashed = false and mimeType contains 'image/'`,
        fields: "files(id, name, createdTime)",
        pageSize: 100,
        orderBy: "createdTime desc",
      });
      return { category, files: res.data.files ?? [] };
    })
  );

  const allFileIds = perCategoryFiles.flatMap(({ files }) =>
    files.map((f) => f.id).filter((id): id is string => Boolean(id))
  );
  if (allFileIds.length === 0) return { imported: 0 };

  const existing = await prisma.expense.findMany({
    where: { receiptPath: { in: allFileIds } },
    select: { receiptPath: true },
  });
  const existingIds = new Set(existing.map((e) => e.receiptPath));

  const toCreate = perCategoryFiles.flatMap(({ category, files }) =>
    files
      .filter((f) => f.id && !existingIds.has(f.id))
      .map((f) => ({
        categoryId: category.id,
        amount: null,
        currency: "CAD",
        vendor: null,
        note: `Auto-imported from Drive (${f.name ?? "photo"})`,
        expenseDate: f.createdTime ? new Date(f.createdTime) : new Date(),
        receiptUrl: `/api/receipts/${f.id}`,
        receiptPath: f.id as string,
        source: "drive_sync",
        createdById: triggeredById,
      }))
  );

  if (toCreate.length === 0) return { imported: 0 };

  const result = await prisma.expense.createMany({ data: toCreate, skipDuplicates: true });
  return { imported: result.count };
}
