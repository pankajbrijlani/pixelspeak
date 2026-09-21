import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { Card, PageHeader, Button } from "@/lib/ui";
import { createExpense } from "@/lib/actions/expenses";
import { DRIVE_CONNECTION_ID } from "@/lib/drive";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default async function NewExpensePage() {
  await requireUserId();
  const [categories, driveConnection] = await Promise.all([
    prisma.expenseCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.driveConnection.findUnique({ where: { id: DRIVE_CONNECTION_ID } }),
  ]);

  return (
    <div className="mx-auto max-w-lg">
      <Link href="/expenses" className="text-xs text-neutral-500 hover:text-neutral-300">
        &larr; Expenses
      </Link>
      <PageHeader title="Add expense" description="Attach a photo of the receipt and fill in the details." />

      {!driveConnection && (
        <Card className="mb-6 border-amber-900 bg-amber-950/30">
          <p className="text-sm text-amber-300">
            Google Drive isn&apos;t connected yet, so there&apos;s nowhere for receipt
            photos to go.{" "}
            <Link href="/settings" className="underline hover:text-amber-200">
              Connect it in Settings
            </Link>{" "}
            first.
          </p>
        </Card>
      )}

      <Card>
        <form action={createExpense} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-400">
              Receipt photo
            </label>
            <input
              type="file"
              name="receipt"
              accept="image/*"
              capture="environment"
              required
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
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-400">Date</label>
              <input
                type="date"
                name="expenseDate"
                defaultValue={today()}
                required
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-400">Category</label>
            <select
              name="categoryId"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-neutral-500">
              Need a new one?{" "}
              <Link href="/expenses/categories" className="text-violet-400 hover:text-violet-300">
                Manage categories
              </Link>
              .
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-400">
              Vendor / merchant (optional)
            </label>
            <input
              name="vendor"
              placeholder="e.g. Adorama, Adobe, Uber"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-400">
              Note (optional)
            </label>
            <textarea
              name="note"
              rows={2}
              placeholder="What was this for?"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            />
          </div>

          <Button type="submit" className="w-full" disabled={!driveConnection}>
            Save expense
          </Button>
        </form>
      </Card>
    </div>
  );
}
