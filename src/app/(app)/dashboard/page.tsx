import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { Card, PageHeader, Badge } from "@/lib/ui";

export default async function DashboardPage() {
  const userId = await requireUserId();

  const [
    leadCount,
    listCount,
    activeCampaigns,
    sentCount,
    openedCount,
    repliedCount,
    activeAds,
    recentCampaigns,
  ] = await Promise.all([
    prisma.lead.count({ where: { leadList: { userId } } }),
    prisma.leadList.count({ where: { userId } }),
    prisma.campaign.count({ where: { userId, status: "ACTIVE" } }),
    prisma.emailEvent.count({ where: { campaign: { userId }, type: "SENT" } }),
    prisma.emailEvent.count({ where: { campaign: { userId }, type: "OPENED" } }),
    prisma.campaignEnrollment.count({ where: { campaign: { userId }, status: "REPLIED" } }),
    prisma.adCampaign.count({ where: { adAccount: { userId }, status: "ACTIVE" } }),
    prisma.campaign.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { leadList: true },
    }),
  ]);

  const openRate = sentCount > 0 ? Math.round((openedCount / sentCount) * 100) : 0;
  const replyRate = sentCount > 0 ? Math.round((repliedCount / sentCount) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Dashboard"
        description="Everything driving new leads to pixelsspeak.com in one place."
      />

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Leads" value={leadCount} sub={`${listCount} lists`} />
        <Stat label="Emails sent" value={sentCount} sub={`${activeCampaigns} active campaigns`} />
        <Stat label="Open rate" value={`${openRate}%`} />
        <Stat label="Reply rate" value={`${replyRate}%`} sub={`${activeAds} live ad campaigns`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold text-white">Recent campaigns</h2>
          {recentCampaigns.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">
              No campaigns yet.{" "}
              <Link href="/campaigns/new" className="text-violet-400 hover:underline">
                Create one
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-800">
              {recentCampaigns.map((c) => (
                <li key={c.id} className="py-3">
                  <Link href={`/campaigns/${c.id}`} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white">{c.name}</p>
                      <p className="text-xs text-neutral-500">{c.leadList.name}</p>
                    </div>
                    <Badge tone={c.status === "ACTIVE" ? "green" : "amber"}>{c.status}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-white">Get started</h2>
          <ol className="mt-3 space-y-2 text-sm text-neutral-400">
            <li>
              1. <Link href="/settings" className="text-violet-400 hover:underline">Connect your Gmail</Link> and, optionally, a Meta ad account.
            </li>
            <li>
              2. <Link href="/leads" className="text-violet-400 hover:underline">Upload a CSV</Link> of prospects.
            </li>
            <li>
              3. <Link href="/campaigns/new" className="text-violet-400 hover:underline">Build a cold email sequence</Link> and enroll the list.
            </li>
            <li>
              4. <Link href="/ads/new" className="text-violet-400 hover:underline">Launch a Meta ad</Link> to bring in inbound leads too.
            </li>
          </ol>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-neutral-600">{sub}</p>}
    </Card>
  );
}
