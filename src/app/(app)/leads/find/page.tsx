import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { Card, PageHeader } from "@/lib/ui";
import FindLeadsTabs from "./find-leads-tabs";

export default async function FindLeadsPage() {
  const userId = await requireUserId();

  const [providers, leadLists] = await Promise.all([
    prisma.leadProvider.findMany({ where: { userId, isActive: true } }),
    prisma.leadList.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    }),
  ]);

  const apolloConnected = providers.some((p) => p.provider === "apollo");
  const googlePlacesConnected = providers.some((p) => p.provider === "google_places");
  const hunterConnected = providers.some((p) => p.provider === "hunter");

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/leads" className="text-xs text-neutral-500 hover:text-neutral-300">
        &larr; Leads
      </Link>
      <PageHeader
        title="Find leads"
        description="Search for people by job title (Apollo) or businesses by category (Google Places + Hunter.io), then pull the ones you want into a list."
      />

      {!apolloConnected && !googlePlacesConnected ? (
        <Card className="border-amber-900 bg-amber-950/30">
          <p className="text-sm text-amber-300">
            No lead-search provider connected yet.{" "}
            <Link href="/settings" className="underline">
              Connect Apollo, or Google Places + Hunter.io, in Settings
            </Link>{" "}
            to search here. In the meantime you can still{" "}
            <Link href="/leads" className="underline">
              upload a CSV
            </Link>
            .
          </p>
        </Card>
      ) : (
        <FindLeadsTabs
          leadLists={leadLists}
          apolloConnected={apolloConnected}
          googlePlacesConnected={googlePlacesConnected}
          hunterConnected={hunterConnected}
        />
      )}
    </div>
  );
}
