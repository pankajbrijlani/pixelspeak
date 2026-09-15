import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { Card, PageHeader, Badge, Button } from "@/lib/ui";

export default async function CampaignsPage() {
  const userId = await requireUserId();
  const campaigns = await prisma.campaign.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      leadList: true,
      _count: { select: { enrollments: true, emailEvents: true } },
    },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Cold Email Campaigns"
        description="Build a multi-step sequence and send it through your connected Gmail account."
        action={
          <Link href="/campaigns/new">
            <Button>New campaign</Button>
          </Link>
        }
      />

      {campaigns.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-400">
            No campaigns yet.{" "}
            <Link href="/campaigns/new" className="text-violet-400 hover:underline">
              Create your first one
            </Link>
            .
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link href={`/campaigns/${c.id}`}>
                <Card className="flex items-center justify-between p-4 transition hover:border-neutral-700">
                  <div>
                    <p className="text-sm font-medium text-white">{c.name}</p>
                    <p className="text-xs text-neutral-500">
                      {c.leadList.name} &middot; {c._count.enrollments} enrolled
                    </p>
                  </div>
                  <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function statusTone(status: string): "neutral" | "green" | "amber" {
  if (status === "ACTIVE") return "green";
  if (status === "PAUSED") return "amber";
  return "neutral";
}
