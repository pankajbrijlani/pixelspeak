"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { launchAdCampaignDraft, setMetaAdStatus, MetaApiError } from "@/lib/meta";

const createSchema = z.object({
  adAccountId: z.string().min(1),
  name: z.string().min(1),
  objective: z.enum(["LEAD_GENERATION", "TRAFFIC", "ENGAGEMENT", "AWARENESS"]),
  dailyBudgetCents: z.number().int().min(100),
  headline: z.string().optional(),
  primaryText: z.string().optional(),
  imageUrl: z.string().optional(),
  destinationUrl: z.string().optional(),
  targetLocations: z.array(z.string()).min(1),
  targetAgeMin: z.number().int().min(13).max(65),
  targetAgeMax: z.number().int().min(13).max(65),
  targetInterests: z.array(z.string()),
});

export async function createAdCampaign(formData: FormData) {
  const userId = await requireUserId();

  const raw = {
    adAccountId: String(formData.get("adAccountId") ?? ""),
    name: String(formData.get("name") ?? ""),
    objective: String(formData.get("objective") ?? "LEAD_GENERATION"),
    dailyBudgetCents: Math.round(Number(formData.get("dailyBudget") ?? 20) * 100),
    headline: String(formData.get("headline") ?? ""),
    primaryText: String(formData.get("primaryText") ?? ""),
    imageUrl: String(formData.get("imageUrl") ?? ""),
    destinationUrl: String(formData.get("destinationUrl") ?? ""),
    targetLocations: String(formData.get("targetLocations") ?? "CA")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
    targetAgeMin: Number(formData.get("targetAgeMin") ?? 21),
    targetAgeMax: Number(formData.get("targetAgeMax") ?? 65),
    targetInterests: String(formData.get("targetInterests") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };

  const parsed = createSchema.parse(raw);

  const account = await prisma.adAccount.findFirst({
    where: { id: parsed.adAccountId, userId },
  });
  if (!account) throw new Error("Ad account not found");

  const adCampaign = await prisma.adCampaign.create({
    data: {
      adAccountId: parsed.adAccountId,
      name: parsed.name,
      objective: parsed.objective,
      dailyBudgetCents: parsed.dailyBudgetCents,
      headline: parsed.headline || undefined,
      primaryText: parsed.primaryText || undefined,
      imageUrl: parsed.imageUrl || undefined,
      destinationUrl: parsed.destinationUrl || undefined,
      targetLocations: parsed.targetLocations,
      targetAgeMin: parsed.targetAgeMin,
      targetAgeMax: parsed.targetAgeMax,
      targetInterests: parsed.targetInterests,
    },
  });

  revalidatePath("/ads");
  redirect(`/ads/${adCampaign.id}`);
}

export async function launchAdCampaign(adCampaignId: string) {
  const userId = await requireUserId();
  const campaign = await prisma.adCampaign.findFirst({
    where: { id: adCampaignId, adAccount: { userId } },
    include: { adAccount: true },
  });
  if (!campaign) throw new Error("Ad campaign not found");

  try {
    const result = await launchAdCampaignDraft(campaign.adAccount, campaign);
    await prisma.adCampaign.update({
      where: { id: campaign.id },
      data: {
        metaCampaignId: result.metaCampaignId,
        metaAdSetId: result.metaAdSetId,
        metaAdId: result.metaAdId,
        status: "PENDING_REVIEW",
        lastError: null,
      },
    });
  } catch (err) {
    const message = err instanceof MetaApiError ? err.message : "Failed to launch ad campaign";
    await prisma.adCampaign.update({
      where: { id: campaign.id },
      data: { status: "FAILED", lastError: message },
    });
  }

  revalidatePath(`/ads/${adCampaignId}`);
}

export async function setAdCampaignLiveStatus(
  adCampaignId: string,
  status: "ACTIVE" | "PAUSED"
) {
  const userId = await requireUserId();
  const campaign = await prisma.adCampaign.findFirst({
    where: { id: adCampaignId, adAccount: { userId } },
    include: { adAccount: true },
  });
  if (!campaign?.metaCampaignId) throw new Error("Campaign hasn't been launched to Meta yet");

  try {
    await setMetaAdStatus(campaign.adAccount, campaign.metaCampaignId, status);
    await prisma.adCampaign.update({
      where: { id: campaign.id },
      data: { status, lastError: null },
    });
  } catch (err) {
    const message = err instanceof MetaApiError ? err.message : "Failed to update ad status";
    await prisma.adCampaign.update({
      where: { id: campaign.id },
      data: { lastError: message },
    });
  }

  revalidatePath(`/ads/${adCampaignId}`);
}

export async function deleteAdCampaign(adCampaignId: string) {
  const userId = await requireUserId();
  await prisma.adCampaign.deleteMany({
    where: { id: adCampaignId, adAccount: { userId } },
  });
  revalidatePath("/ads");
  redirect("/ads");
}
