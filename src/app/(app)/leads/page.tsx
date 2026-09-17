import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { Card, PageHeader, Button } from "@/lib/ui";
import { uploadLeadsCsv, deleteLeadList } from "@/lib/actions/leads";

export default async function LeadsPage() {
  const userId = await requireUserId();
  const lists = await prisma.leadList.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { leads: true } } },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Leads"
        description="Upload a CSV of prospects, or search Apollo.io to find new ones — either way you get a list you can enroll into a cold email campaign."
        action={
          <Link href="/leads/find">
            <Button variant="secondary">Find leads on Apollo</Button>
          </Link>
        }
      />

      <Card className="mb-8">
        <h2 className="text-sm font-semibold text-white">Import a CSV</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Already have a list? Needs at minimum an <code>email</code> column. We&apos;ll
          also pick up first name, last name, company, title, website, phone, and
          LinkedIn URL columns automatically — anything else is kept as a custom field
          you can use in templates.
        </p>
        <form action={uploadLeadsCsv} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-neutral-400">
              List name (optional)
            </label>
            <input
              name="listName"
              placeholder="e.g. Toronto wedding photographers"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400">
              CSV file
            </label>
            <input
              type="file"
              name="file"
              accept=".csv,text/csv"
              required
              className="mt-1 block text-sm text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-800 file:px-3 file:py-2 file:text-sm file:text-white hover:file:bg-neutral-700"
            />
          </div>
          <Button type="submit">Upload</Button>
        </form>
      </Card>

      <h2 className="mb-3 text-sm font-semibold text-white">Your lists</h2>
      {lists.length === 0 ? (
        <p className="text-sm text-neutral-500">No lead lists yet.</p>
      ) : (
        <ul className="space-y-2">
          {lists.map((list) => (
            <li key={list.id}>
              <Card className="flex items-center justify-between p-4">
                <Link href={`/leads/${list.id}`} className="flex-1">
                  <p className="text-sm font-medium text-white">{list.name}</p>
                  <p className="text-xs text-neutral-500">
                    {list._count.leads} leads &middot; imported{" "}
                    {list.createdAt.toLocaleDateString()}
                  </p>
                </Link>
                <form action={deleteLeadList.bind(null, list.id)}>
                  <Button variant="danger" type="submit">
                    Delete
                  </Button>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
