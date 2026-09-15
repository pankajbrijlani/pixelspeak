import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { Card, PageHeader, Badge } from "@/lib/ui";
import { deleteLead } from "@/lib/actions/leads";

export default async function LeadListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const userId = await requireUserId();
  const { id } = await params;
  const sp = await searchParams;

  const list = await prisma.leadList.findFirst({
    where: { id, userId },
    include: { leads: { orderBy: { createdAt: "desc" }, take: 500 } },
  });
  if (!list) notFound();

  const imported = typeof sp.imported === "string" ? sp.imported : undefined;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/leads" className="text-xs text-neutral-500 hover:text-neutral-300">
        &larr; All lists
      </Link>
      <PageHeader
        title={list.name}
        description={`${list.leads.length} leads`}
        action={
          <Link href={`/campaigns/new?listId=${list.id}`}>
            <span className="inline-flex items-center justify-center rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-500">
              Start a campaign with this list
            </span>
          </Link>
        }
      />

      {imported && (
        <div className="mb-6 rounded-xl border border-emerald-900 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-300">
          Imported {imported} leads
          {sp.skipped && sp.skipped !== "0" ? ` (${sp.skipped} rows skipped — missing/invalid email)` : ""}.
        </div>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {list.leads.map((lead) => (
              <tr key={lead.id}>
                <td className="px-4 py-3 text-neutral-200">{lead.email}</td>
                <td className="px-4 py-3 text-neutral-400">
                  {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "—"}
                </td>
                <td className="px-4 py-3 text-neutral-400">{lead.company ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-400">{lead.title ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge tone={statusTone(lead.status)}>{lead.status}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={deleteLead.bind(null, lead.id, list.id)}>
                    <button
                      type="submit"
                      className="text-xs text-neutral-500 hover:text-red-400"
                    >
                      Remove
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function statusTone(status: string): "neutral" | "green" | "amber" | "red" | "violet" {
  switch (status) {
    case "REPLIED":
    case "INTERESTED":
      return "green";
    case "CONTACTED":
    case "ENROLLED":
      return "violet";
    case "BOUNCED":
    case "NOT_INTERESTED":
    case "UNSUBSCRIBED":
      return "red";
    default:
      return "neutral";
  }
}
