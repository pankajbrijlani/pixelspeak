import { put, del } from "@vercel/blob";

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // 10MB

export class ReceiptUploadError extends Error {}

export async function uploadReceipt(
  file: File
): Promise<{ url: string; pathname: string }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new ReceiptUploadError(
      "Photo storage isn't set up yet. Add a Vercel Blob store and its BLOB_READ_WRITE_TOKEN to your environment."
    );
  }
  if (!file.type.startsWith("image/")) {
    throw new ReceiptUploadError("Please upload a photo (JPG, PNG, HEIC, etc).");
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    throw new ReceiptUploadError("Photo is too large (10MB max).");
  }

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const blob = await put(`receipts/${Date.now()}-${crypto.randomUUID()}.${ext}`, file, {
    access: "public",
    addRandomSuffix: false,
  });

  return { url: blob.url, pathname: blob.pathname };
}

export async function deleteReceipt(pathname: string): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    await del(pathname);
  } catch {
    // best-effort: don't block the DB delete on a storage hiccup
  }
}
