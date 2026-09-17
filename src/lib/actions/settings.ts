"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { requireUserId } from "@/lib/session";

export async function removeEmailAccount(id: string) {
  const userId = await requireUserId();
  await prisma.emailAccount.deleteMany({ where: { id, userId } });
  revalidatePath("/settings");
}

export async function toggleEmailAccount(id: string, isActive: boolean) {
  const userId = await requireUserId();
  await prisma.emailAccount.updateMany({
    where: { id, userId },
    data: { isActive },
  });
  revalidatePath("/settings");
}

export async function connectAdAccount(formData: FormData) {
  const userId = await requireUserId();
  const businessName = String(formData.get("businessName") ?? "").trim();
  const adAccountId = String(formData.get("adAccountId") ?? "").trim();
  const pageId = String(formData.get("pageId") ?? "").trim();
  const accessToken = String(formData.get("accessToken") ?? "").trim();

  if (!adAccountId) {
    throw new Error("Ad account ID is required (e.g. act_1234567890)");
  }

  await prisma.adAccount.upsert({
    where: { userId_adAccountId: { userId, adAccountId } },
    update: {
      businessName: businessName || undefined,
      pageId: pageId || undefined,
      accessToken: accessToken ? encryptSecret(accessToken) : undefined,
      isActive: true,
    },
    create: {
      userId,
      adAccountId,
      businessName: businessName || undefined,
      pageId: pageId || undefined,
      accessToken: accessToken ? encryptSecret(accessToken) : undefined,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/ads");
}

export async function removeAdAccount(id: string) {
  const userId = await requireUserId();
  await prisma.adAccount.deleteMany({ where: { id, userId } });
  revalidatePath("/settings");
  revalidatePath("/ads");
}

export async function connectLeadProvider(formData: FormData) {
  const userId = await requireUserId();
  const apiKey = String(formData.get("apiKey") ?? "").trim();

  if (!apiKey) {
    throw new Error("API key is required");
  }

  await prisma.leadProvider.upsert({
    where: { userId_provider: { userId, provider: "apollo" } },
    update: { apiKey: encryptSecret(apiKey), isActive: true },
    create: { userId, provider: "apollo", apiKey: encryptSecret(apiKey) },
  });

  revalidatePath("/settings");
  revalidatePath("/leads/find");
}

export async function removeLeadProvider(id: string) {
  const userId = await requireUserId();
  await prisma.leadProvider.deleteMany({ where: { id, userId } });
  revalidatePath("/settings");
  revalidatePath("/leads/find");
}
