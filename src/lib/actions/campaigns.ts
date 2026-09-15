"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { nextWithinSendWindow } from "@/lib/schedule";

const stepSchema = z.object({
  order: z.number().int().min(1),
  delayDays: z.number().int().min(0),
  subject: z.string().min(1),
  bodyHtml: z.string().min(1),
});

const createCampaignSchema = z.object({
  name: z.string().min(1),
  leadListId: z.string().min(1),
  emailAccountId: z.string().min(1),
  timezone: z.string().min(1),
  sendWindowStart: z.number().int().min(0).max(23),
  sendWindowEnd: z.number().int().min(1).max(24),
  sendDays: z.array(z.number().int().min(0).max(6)).min(1),
  steps: z.array(stepSchema).min(1),
});

export async function createCampaign(formData: FormData) {
  const userId = await requireUserId();

  const raw = {
    name: String(formData.get("name") ?? ""),
    leadListId: String(formData.get("leadListId") ?? ""),
    emailAccountId: String(formData.get("emailAccountId") ?? ""),
    timezone: String(formData.get("timezone") ?? "America/Toronto"),
    sendWindowStart: Number(formData.get("sendWindowStart") ?? 9),
    sendWindowEnd: Number(formData.get("sendWindowEnd") ?? 17),
    sendDays: String(formData.get("sendDays") ?? "1,2,3,4,5")
      .split(",")
      .filter(Boolean)
      .map(Number),
    steps: JSON.parse(String(formData.get("stepsJson") ?? "[]")),
  };

  const parsed = createCampaignSchema.parse(raw);

  const [list, account] = await Promise.all([
    prisma.leadList.findFirst({ where: { id: parsed.leadListId, userId } }),
    prisma.emailAccount.findFirst({ where: { id: parsed.emailAccountId, userId } }),
  ]);
  if (!list) throw new Error("Lead list not found");
  if (!account) throw new Error("Email account not found");

  const campaign = await prisma.campaign.create({
    data: {
      userId,
      leadListId: parsed.leadListId,
      emailAccountId: parsed.emailAccountId,
      name: parsed.name,
      timezone: parsed.timezone,
      sendWindowStart: parsed.sendWindowStart,
      sendWindowEnd: parsed.sendWindowEnd,
      sendDays: parsed.sendDays,
      steps: {
        create: parsed.steps.map((step) => ({
          order: step.order,
          delayDays: step.delayDays,
          subject: step.subject,
          bodyHtml: step.bodyHtml,
        })),
      },
    },
  });

  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaign.id}`);
}

export async function enrollListIntoCampaign(campaignId: string) {
  const userId = await requireUserId();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId },
    include: { leadList: { include: { leads: true } } },
  });
  if (!campaign) throw new Error("Campaign not found");

  const existing = await prisma.campaignEnrollment.findMany({
    where: { campaignId },
    select: { leadId: true },
  });
  const existingIds = new Set(existing.map((e) => e.leadId));
  const toEnroll = campaign.leadList.leads.filter((lead) => !existingIds.has(lead.id));

  if (toEnroll.length === 0) {
    revalidatePath(`/campaigns/${campaignId}`);
    return;
  }

  const nextSendAt = nextWithinSendWindow(new Date(), {
    timezone: campaign.timezone,
    sendWindowStart: campaign.sendWindowStart,
    sendWindowEnd: campaign.sendWindowEnd,
    sendDays: campaign.sendDays,
  });

  await prisma.$transaction([
    prisma.campaignEnrollment.createMany({
      data: toEnroll.map((lead) => ({
        campaignId,
        leadId: lead.id,
        status: "ACTIVE",
        nextSendAt,
      })),
      skipDuplicates: true,
    }),
    prisma.lead.updateMany({
      where: { id: { in: toEnroll.map((l) => l.id) } },
      data: { status: "ENROLLED" },
    }),
  ]);

  revalidatePath(`/campaigns/${campaignId}`);
}

export async function setCampaignStatus(
  campaignId: string,
  status: "ACTIVE" | "PAUSED"
) {
  const userId = await requireUserId();
  await prisma.campaign.updateMany({
    where: { id: campaignId, userId },
    data: { status },
  });
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
}

export async function markEnrollmentReplied(enrollmentId: string, campaignId: string) {
  const userId = await requireUserId();
  const enrollment = await prisma.campaignEnrollment.findFirst({
    where: { id: enrollmentId, campaign: { userId } },
  });
  if (!enrollment) throw new Error("Not found");

  await prisma.$transaction([
    prisma.campaignEnrollment.update({
      where: { id: enrollmentId },
      data: { status: "REPLIED", nextSendAt: null },
    }),
    prisma.lead.update({
      where: { id: enrollment.leadId },
      data: { status: "REPLIED" },
    }),
  ]);

  revalidatePath(`/campaigns/${campaignId}`);
}

export async function deleteCampaign(campaignId: string) {
  const userId = await requireUserId();
  await prisma.campaign.deleteMany({ where: { id: campaignId, userId } });
  revalidatePath("/campaigns");
  redirect("/campaigns");
}
