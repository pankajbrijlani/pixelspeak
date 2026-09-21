import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { Card, PageHeader, Button, Badge } from "@/lib/ui";
import { updateExpense, deleteExpense } from "@/lib/actions/expenses";

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUserId();
  const { id } = await params;

  const [expense, categories] = await Promise.all([
    prisma.expense.findUnique({ where: { id } }),
    prisma.expenseCategory.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!expense) notFound();
  const needsReview = expense.amount === null;

  return (
    <div className="mx-auto max-w-lg">
      <Link href="/expenses" className="text-xs text-neutral-500 hover:text-neutral-300">
        &larr; Expenses
      </Link>
      <PageHeader
        title="Edit expense"
        action={needsReview ? <Badge tone="amber">Needs review</Badge> : undefined}
      />
      {needsReview && (
        <Card className="mb-6 border-amber-900 bg-amber-950/30">
          <p className="text-sm text-amber-300">
            This receipt was auto-imported from Drive — it just needs an amount
            (and a vendor, if you want one) before it&apos;s a real expense.
          </p>
        </Card>
      )}

      <Card>
        <div className="relative mb-4 h-40 w-full overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
          <Image
            src={expense.receiptUrl}
            alt="Receipt"
            fill
            sizes="512px"
            className="object-contain"
            unoptimized
          />
        </div>

        <form action={updateExpense.bind(null, id)} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-400">
              Replace photo (optional)
            </label>
            <input
              type="file"
              name="receipt"
              accept="image/*"
              className="mt-1 block w-full text-sm text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-800 file:px-3 file:py-2 file:text-sm file:text-white hover:file:bg-neutral-700"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-400">Amount</label>
              <input
                type="number"
                name="amount"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                defaultValue={expense.amount ? Number(expense.amount) : undefined}
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-400">Date</label>
              <input
                type="date"
                name="expenseDate"
                required
                defaultValue={expense.expenseDate.toISOString().slice(0, 10)}
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-400">Category</label>
            <select
              name="categoryId"
              defaultValue={expense.categoryId ?? ""}
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-400">
              Vendor / merchant
            </label>
            <input
              name="vendor"
              defaultValue={expense.vendor ?? ""}
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-400">Note</label>
            <textarea
              name="note"
              rows={2}
              defaultValue={expense.note ?? ""}
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            />
          </div>

          <Button type="submit" className="w-full">
            Save changes
          </Button>
        </form>

        <form action={deleteExpense.bind(null, id)} className="mt-3">
          <Button type="submit" variant="danger" className="w-full">
            Delete expense
          </Button>
        </form>
      </Card>
    </div>
  );
}
