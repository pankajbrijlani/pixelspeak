import { prisma } from "@/lib/prisma";
import { personalize } from "@/lib/template";
import { nextWithinSendWindow } from "@/lib/schedule";
import { sendViaGmail } from "@/lib/mailer";

const BATCH_SIZE = 25;

function trackingPixel(eventId: string): string {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `<img src="${base}/api/track/open/${eventId}" width="1" height="1" style="display:none" alt="" />`;
}

export async function processDueEnrollments(): Promise<{
  sent: number;
  failed: number;
  skippedLimit: number;
}> {
  const now = new Date();
  let sent = 0;
  let failed = 0;
  let skippedLimit = 0;

  const dueEnrollments = await prisma.campaignEnrollment.findMany({
    where: {
      status: "ACTIVE",
      nextSendAt: { lte: now },
      campaign: { status: "ACTIVE" },
    },
    orderBy: { nextSendAt: "asc" },
    take: BATCH_SIZE,
    include: {
      lead: true,
      campaign: {
        include: { steps: { orderBy: { order: "asc" } }, emailAccount: true },
      },
      currentStep: true,
    },
  });

  const sendCountToday = new Map<string, number>();

  for (const enrollment of dueEnrollments) {
    const { campaign, lead } = enrollment;
    const account = campaign.emailAccount;

    if (!account.isActive || !account.refreshToken) {
      continue;
    }

    if (!sendCountToday.has(account.id)) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const count = await prisma.emailEvent.count({
        where: {
          type: "SENT",
          campaign: { emailAccountId: account.id },
          createdAt: { gte: startOfDay },
        },
      });
      sendCountToday.set(account.id, count);
    }

    const sentSoFar = sendCountToday.get(account.id) ?? 0;
    if (sentSoFar >= account.dailySendLimit) {
      skippedLimit += 1;
      continue;
    }

    const currentIndex = enrollment.currentStepId
      ? campaign.steps.findIndex((s) => s.id === enrollment.currentStepId)
      : -1;
    const nextStep = campaign.steps[currentIndex + 1];

    if (!nextStep) {
      await prisma.campaignEnrollment.update({
        where: { id: enrollment.id },
        data: { status: "COMPLETED", nextSendAt: null },
      });
      continue;
    }

    const subject = personalize(nextStep.subject, lead);
    let html = personalize(nextStep.bodyHtml, lead);

    const event = await prisma.emailEvent.create({
      data: {
        campaignId: campaign.id,
        stepId: nextStep.id,
        leadId: lead.id,
        type: "QUEUED",
      },
    });

    html += trackingPixel(event.id);

    const previousEvent = await prisma.emailEvent.findFirst({
      where: { campaignId: campaign.id, leadId: lead.id, type: "SENT" },
      orderBy: { createdAt: "desc" },
    });

    try {
      const result = await sendViaGmail(account, {
        to: lead.email,
        subject: previousEvent ? `Re: ${personalize(campaign.steps[0].subject, lead)}` : subject,
        html,
        inReplyToMessageId: previousEvent?.messageId,
        threadId: previousEvent?.threadId,
      });

      await prisma.emailEvent.update({
        where: { id: event.id },
        data: {
          type: "SENT",
          messageId: result.messageId,
          threadId: result.threadId,
        },
      });

      const followingStep = campaign.steps[currentIndex + 2];
      const nextSendAt = followingStep
        ? nextWithinSendWindow(
            addDays(new Date(), followingStep.delayDays),
            {
              timezone: campaign.timezone,
              sendWindowStart: campaign.sendWindowStart,
              sendWindowEnd: campaign.sendWindowEnd,
              sendDays: campaign.sendDays,
            }
          )
        : null;

      await prisma.campaignEnrollment.update({
        where: { id: enrollment.id },
        data: {
          currentStepId: nextStep.id,
          status: followingStep ? "ACTIVE" : "COMPLETED",
          nextSendAt,
        },
      });

      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: "CONTACTED" },
      });

      sendCountToday.set(account.id, sentSoFar + 1);
      sent += 1;
    } catch (err) {
      console.error(`Failed to send to ${lead.email}`, err);
      await prisma.emailEvent.update({
        where: { id: event.id },
        data: { type: "FAILED", detail: err instanceof Error ? err.message : String(err) },
      });
      failed += 1;
    }
  }

  return { sent, failed, skippedLimit };
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
