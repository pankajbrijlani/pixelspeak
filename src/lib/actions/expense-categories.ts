"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

const COLORS = ["neutral", "green", "amber", "red", "violet"] as const;

export async function createExpenseCategory(formData: FormData) {
  await requireUserId();
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "violet");
  if (!name) throw new Error("Category name is required");

  const existing = await prisma.expenseCategory.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (existing) throw new Error("A category with that name already exists");

  await prisma.expenseCategory.create({
    data: { name, color: COLORS.includes(color as (typeof COLORS)[number]) ? color : "violet" },
  });
  revalidatePath("/expenses/categories");
  revalidatePath("/expenses");
}

export async function renameExpenseCategory(id: string, formData: FormData) {
  await requireUserId();
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "violet");
  if (!name) throw new Error("Category name is required");

  const existing = await prisma.expenseCategory.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, id: { not: id } },
  });
  if (existing) throw new Error("A category with that name already exists");

  await prisma.expenseCategory.update({
    where: { id },
    data: { name, color: COLORS.includes(color as (typeof COLORS)[number]) ? color : "violet" },
  });
  revalidatePath("/expenses/categories");
  revalidatePath("/expenses");
}

export async function deleteExpenseCategory(id: string) {
  await requireUserId();
  // Expenses in this category aren't deleted — they just fall back to
  // "Uncategorized" (categoryId is nullable, see schema.prisma).
  await prisma.expenseCategory.delete({ where: { id } });
  revalidatePath("/expenses/categories");
  revalidatePath("/expenses");
}
