import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { Card, PageHeader } from "@/lib/ui";
import FindLeadsForm from "./find-leads-form";

export default async function FindLeadsPage() {
  const userId = await requireUserId();

  const [provider, leadLists] = await Promise.all([
    prisma.leadProvider.findFirst({
      where: { userId, provider: "apollo", isActive: true },
    }),
    prisma.leadList.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/leads" className="text-xs text-neutral-500 hover:text-neutral-300">
        &larr; Leads
      </Link>
      <PageHeader
        title="Find leads"
        description="Search Apollo.io by job title, location, and keyword, then pull the ones you want into a list."
      />

      {!provider ? (
        <Card className="border-amber-900 bg-amber-950/30">
          <p className="text-sm text-amber-300">
            No Apollo account connected yet.{" "}
            <Link href="/settings" className="underline">
              Connect your Apollo API key in Settings
            </Link>{" "}
            to search for leads here. In the meantime you can still{" "}
            <Link href="/leads" className="underline">
              upload a CSV
            </Link>
            .
          </p>
        </Card>
      ) : (
        <FindLeadsForm leadLists={leadLists} />
      )}
    </div>
  );
}
