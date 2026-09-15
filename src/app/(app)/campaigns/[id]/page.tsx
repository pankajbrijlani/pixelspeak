import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { Card, PageHeader, Badge, Button } from "@/lib/ui";
import {
  enrollListIntoCampaign,
  setCampaignStatus,
  markEnrollmentReplied,
  deleteCampaign,
} from "@/lib/actions/campaigns";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  const { id } = await params;

  const campaign = await prisma.campaign.findFirst({
    where: { id, userId },
    include: {
      leadList: true,
      emailAccount: true,
      steps: { orderBy: { order: "asc" } },
      enrollments: {
        orderBy: { createdAt: "desc" },
        take: 200,
        include: { lead: true, currentStep: true },
      },
      _count: { select: { enrollments: true } },
    },
  });
  if (!campaign) notFound();

  const [sentCount, openedCount, repliedCount] = await Promise.all([
    prisma.emailEvent.count({ where: { campaignId: id, type: "SENT" } }),
    prisma.emailEvent.count({ where: { campaignId: id, type: "OPENED" } }),
    prisma.campaignEnrollment.count({ where: { campaignId: id, status: "REPLIED" } }),
  ]);

  const canSend = Boolean(campaign.emailAccount.refreshToken) && campaign.emailAccount.isActive;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/campaigns" className="text-xs text-neutral-500 hover:text-neutral-300">
        &larr; All campaigns
      </Link>

      <PageHeader
        title={campaign.name}
        description={`${campaign.leadList.name} · sending from ${campaign.emailAccount.emailAddress}`}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={campaign.status === "ACTIVE" ? "green" : "amber"}>
              {campaign.status}
            </Badge>
            {campaign.status === "ACTIVE" ? (
              <form action={setCampaignStatus.bind(null, campaign.id, "PAUSED")}>
                <Button variant="secondary" type="submit">
                  Pause
                </Button>
              </form>
            ) : (
              <form action={setCampaignStatus.bind(null, campaign.id, "ACTIVE")}>
                <Button type="submit" disabled={!canSend}>
                  Activate
                </Button>
              </form>
            )}
          </div>
        }
      />

      {!canSend && (
        <Card className="mb-6 border-amber-900 bg-amber-950/30">
          <p className="text-sm text-amber-300">
            {campaign.emailAccount.emailAddress} isn&apos;t connected for sending.
            Reconnect it in{" "}
            <Link href="/settings" className="underline">
              Settings
            </Link>{" "}
            before activating this campaign.
          </p>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Enrolled" value={campaign._count.enrollments} />
        <Stat label="Sent" value={sentCount} />
        <Stat label="Opened" value={openedCount} />
        <Stat label="Replied" value={repliedCount} />
      </div>

      <Card className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Leads</h2>
            <p className="mt-1 text-sm text-neutral-400">
              {campaign._count.enrollments} of {campaign.leadList.name}&apos;s leads
              enrolled.
            </p>
          </div>
          <form action={enrollListIntoCampaign.bind(null, campaign.id)}>
            <Button variant="secondary" type="submit">
              Enroll new leads from list
            </Button>
          </form>
        </div>
      </Card>

      <h2 className="mb-3 text-sm font-semibold text-white">Sequence</h2>
      <div className="mb-8 space-y-2">
        {campaign.steps.map((step) => (
          <Card key={step.id}>
            <p className="text-xs font-medium text-neutral-500">
              {step.order === 1 ? "Sent immediately" : `${step.delayDays} day(s) after previous step`}
            </p>
            <p className="mt-1 text-sm font-medium text-white">{step.subject}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-400">
              {step.bodyHtml}
            </p>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 text-sm font-semibold text-white">Enrollments</h2>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Current step</th>
              <th className="px-4 py-3">Next send</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {campaign.enrollments.map((enrollment) => (
              <tr key={enrollment.id}>
                <td className="px-4 py-3 text-neutral-200">{enrollment.lead.email}</td>
                <td className="px-4 py-3">
                  <Badge tone={enrollmentTone(enrollment.status)}>{enrollment.status}</Badge>
                </td>
                <td className="px-4 py-3 text-neutral-400">
                  {enrollment.currentStep ? `Step ${enrollment.currentStep.order}` : "—"}
                </td>
                <td className="px-4 py-3 text-neutral-400">
                  {enrollment.nextSendAt
                    ? enrollment.nextSendAt.toLocaleString()
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  {enrollment.status === "ACTIVE" && (
                    <form action={markEnrollmentReplied.bind(null, enrollment.id, campaign.id)}>
                      <button
                        type="submit"
                        className="text-xs text-neutral-500 hover:text-emerald-400"
                      >
                        Mark replied
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {campaign.enrollments.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-neutral-500">
                  No leads enrolled yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <div className="mt-8 flex justify-end">
        <form action={deleteCampaign.bind(null, campaign.id)}>
          <Button variant="danger" type="submit">
            Delete campaign
          </Button>
        </form>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </Card>
  );
}

function enrollmentTone(status: string): "neutral" | "green" | "amber" | "red" | "violet" {
  switch (status) {
    case "REPLIED":
      return "green";
    case "ACTIVE":
      return "violet";
    case "BOUNCED":
    case "UNSUBSCRIBED":
      return "red";
    case "COMPLETED":
      return "neutral";
    default:
      return "amber";
  }
}
