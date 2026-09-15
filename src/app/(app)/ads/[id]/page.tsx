import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { Card, PageHeader, Badge, Button } from "@/lib/ui";
import {
  launchAdCampaign,
  setAdCampaignLiveStatus,
  deleteAdCampaign,
} from "@/lib/actions/ads";

export default async function AdCampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  const { id } = await params;

  const campaign = await prisma.adCampaign.findFirst({
    where: { id, adAccount: { userId } },
    include: { adAccount: true },
  });
  if (!campaign) notFound();

  const isConnected = Boolean(campaign.adAccount.accessToken);
  const isLaunched = Boolean(campaign.metaCampaignId);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/ads" className="text-xs text-neutral-500 hover:text-neutral-300">
        &larr; All ad campaigns
      </Link>

      <PageHeader
        title={campaign.name}
        description={campaign.adAccount.businessName ?? campaign.adAccount.adAccountId}
        action={<Badge tone={statusTone(campaign.status)}>{campaign.status.replace("_", " ")}</Badge>}
      />

      {campaign.lastError && (
        <Card className="mb-6 border-red-900 bg-red-950/30">
          <p className="text-sm text-red-300">{campaign.lastError}</p>
        </Card>
      )}

      {!isConnected && (
        <Card className="mb-6 border-amber-900 bg-amber-950/30">
          <p className="text-sm text-amber-300">
            This ad account has no access token, so this campaign is draft-only.{" "}
            <Link href="/settings" className="underline">
              Add a token in Settings
            </Link>{" "}
            to launch it to Meta.
          </p>
        </Card>
      )}

      <Card className="mb-6 space-y-3">
        <Field label="Objective" value={campaign.objective.replace("_", " ")} />
        <Field label="Daily budget" value={`$${(campaign.dailyBudgetCents / 100).toFixed(2)}`} />
        <Field label="Headline" value={campaign.headline ?? "—"} />
        <Field label="Primary text" value={campaign.primaryText ?? "—"} />
        <Field label="Destination" value={campaign.destinationUrl ?? "—"} />
        <Field
          label="Targeting"
          value={`${campaign.targetLocations.join(", ")} · ages ${campaign.targetAgeMin}-${campaign.targetAgeMax}${
            campaign.targetInterests.length ? ` · ${campaign.targetInterests.join(", ")}` : ""
          }`}
        />
        {isLaunched && <Field label="Meta campaign ID" value={campaign.metaCampaignId!} />}
      </Card>

      <div className="flex flex-wrap gap-2">
        {!isLaunched ? (
          <form action={launchAdCampaign.bind(null, campaign.id)}>
            <Button type="submit" disabled={!isConnected}>
              Launch to Meta (paused)
            </Button>
          </form>
        ) : campaign.status === "ACTIVE" ? (
          <form action={setAdCampaignLiveStatus.bind(null, campaign.id, "PAUSED")}>
            <Button variant="secondary" type="submit">
              Pause
            </Button>
          </form>
        ) : (
          <form action={setAdCampaignLiveStatus.bind(null, campaign.id, "ACTIVE")}>
            <Button type="submit">Go live (starts spending)</Button>
          </form>
        )}
        <form action={deleteAdCampaign.bind(null, campaign.id)}>
          <Button variant="danger" type="submit">
            Delete
          </Button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-sm text-neutral-200">{value}</p>
    </div>
  );
}

function statusTone(status: string): "neutral" | "green" | "amber" | "red" {
  if (status === "ACTIVE") return "green";
  if (status === "PENDING_REVIEW" || status === "DRAFT") return "amber";
  if (status === "FAILED") return "red";
  return "neutral";
}
