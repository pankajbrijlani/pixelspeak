"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { uploadReceipt, deleteReceipt, ReceiptUploadError } from "@/lib/drive";

function parseAmount(raw: FormDataEntryValue | null): number {
  const amount = Number(String(raw ?? "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter a valid amount greater than 0");
  }
  return Math.round(amount * 100) / 100;
}

function parseDate(raw: FormDataEntryValue | null): Date {
  const value = String(raw ?? "");
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date");
  return date;
}

export async function createExpense(formData: FormData) {
  const userId = await requireUserId();

  const file = formData.get("receipt");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Attach a photo of the receipt");
  }

  const amount = parseAmount(formData.get("amount"));
  const vendor = String(formData.get("vendor") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  const expenseDate = parseDate(formData.get("expenseDate"));
  const categoryId = String(formData.get("categoryId") ?? "").trim() || null;

  let receipt;
  try {
    receipt = await uploadReceipt(file);
  } catch (err) {
    throw err instanceof ReceiptUploadError ? err : new Error("Upload failed, try again");
  }

  await prisma.expense.create({
    data: {
      amount,
      vendor,
      note,
      expenseDate,
      categoryId,
      receiptUrl: receipt.url,
      receiptPath: receipt.pathname,
      createdById: userId,
    },
  });

  revalidatePath("/expenses");
  redirect("/expenses?added=1");
}

export async function updateExpense(id: string, formData: FormData) {
  await requireUserId();
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) throw new Error("Expense not found");

  const amount = parseAmount(formData.get("amount"));
  const vendor = String(formData.get("vendor") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  const expenseDate = parseDate(formData.get("expenseDate"));
  const categoryId = String(formData.get("categoryId") ?? "").trim() || null;

  const file = formData.get("receipt");
  let receiptUrl = existing.receiptUrl;
  let receiptPath = existing.receiptPath;
  if (file instanceof File && file.size > 0) {
    const receipt = await uploadReceipt(file).catch((err) => {
      throw err instanceof ReceiptUploadError ? err : new Error("Upload failed, try again");
    });
    await deleteReceipt(existing.receiptPath);
    receiptUrl = receipt.url;
    receiptPath = receipt.pathname;
  }

  await prisma.expense.update({
    where: { id },
    data: { amount, vendor, note, expenseDate, categoryId, receiptUrl, receiptPath },
  });

  revalidatePath("/expenses");
  redirect("/expenses?updated=1");
}

export async function deleteExpense(id: string) {
  await requireUserId();
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (existing) {
    await prisma.expense.delete({ where: { id } });
    await deleteReceipt(existing.receiptPath);
  }
  revalidatePath("/expenses");
  redirect("/expenses");
}
