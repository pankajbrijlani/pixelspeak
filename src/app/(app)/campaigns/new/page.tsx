import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { PageHeader, Card } from "@/lib/ui";
import CampaignForm from "./campaign-form";

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const userId = await requireUserId();
  const sp = await searchParams;
  const listId = typeof sp.listId === "string" ? sp.listId : undefined;

  const [leadLists, emailAccounts] = await Promise.all([
    prisma.leadList.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.emailAccount.findMany({ where: { userId, isActive: true } }),
  ]);

  if (leadLists.length === 0) {
    redirect("/leads");
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New campaign"
        description="Write your sequence, pick who it sends to and from, then launch it."
      />

      {emailAccounts.length === 0 && (
        <Card className="mb-6 border-amber-900 bg-amber-950/30">
          <p className="text-sm text-amber-300">
            You haven&apos;t connected a Gmail account yet. You can still draft a
            campaign, but you&apos;ll need to{" "}
            <a href="/settings" className="underline">
              connect one in Settings
            </a>{" "}
            before you can send it.
          </p>
        </Card>
      )}

      <CampaignForm
        leadLists={leadLists.map((l) => ({ id: l.id, name: l.name }))}
        emailAccounts={emailAccounts.map((a) => ({ id: a.id, emailAddress: a.emailAddress }))}
        defaultListId={listId}
      />
    </div>
  );
}
