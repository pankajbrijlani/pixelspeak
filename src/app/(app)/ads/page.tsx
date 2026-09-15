import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { Card, PageHeader, Badge, Button } from "@/lib/ui";

export default async function AdsPage() {
  const userId = await requireUserId();
  const [adAccounts, adCampaigns] = await Promise.all([
    prisma.adAccount.findMany({ where: { userId } }),
    prisma.adCampaign.findMany({
      where: { adAccount: { userId } },
      orderBy: { createdAt: "desc" },
      include: { adAccount: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Meta Ads"
        description="Create Facebook & Instagram ad campaigns aimed at leads for pixelsspeak.com."
        action={
          adAccounts.length > 0 ? (
            <Link href="/ads/new">
              <Button>New ad campaign</Button>
            </Link>
          ) : undefined
        }
      />

      {adAccounts.length === 0 && (
        <Card className="mb-6 border-amber-900 bg-amber-950/30">
          <p className="text-sm text-amber-300">
            No Meta ad account connected yet.{" "}
            <Link href="/settings" className="underline">
              Connect one in Settings
            </Link>{" "}
            — you can still draft campaigns without it, but nothing will launch to
            Meta until an access token is added.
          </p>
        </Card>
      )}

      {adCampaigns.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-400">No ad campaigns yet.</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {adCampaigns.map((c) => (
            <li key={c.id}>
              <Link href={`/ads/${c.id}`}>
                <Card className="flex items-center justify-between p-4 transition hover:border-neutral-700">
                  <div>
                    <p className="text-sm font-medium text-white">{c.name}</p>
                    <p className="text-xs text-neutral-500">
                      {c.objective.replace("_", " ")} &middot; $
                      {(c.dailyBudgetCents / 100).toFixed(2)}/day
                    </p>
                  </div>
                  <Badge tone={statusTone(c.status)}>{c.status.replace("_", " ")}</Badge>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function statusTone(status: string): "neutral" | "green" | "amber" | "red" {
  if (status === "ACTIVE") return "green";
  if (status === "PENDING_REVIEW" || status === "DRAFT") return "amber";
  if (status === "FAILED") return "red";
  return "neutral";
}
