import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { Card, PageHeader, Badge, Button, coerceBadgeTone } from "@/lib/ui";
import { deleteExpense, checkDriveNow } from "@/lib/actions/expenses";
import { syncReceiptsFromDrive } from "@/lib/drive";
import { formatMoney } from "@/lib/money";
import type { Prisma } from "@prisma/client";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const userId = await requireUserId();
  const sp = await searchParams;
  const categoryId = typeof sp.category === "string" ? sp.category : undefined;
  const month = typeof sp.month === "string" ? sp.month : undefined; // "YYYY-MM"
  const reviewOnly = sp.review === "1";
  const synced = typeof sp.synced === "string" ? parseInt(sp.synced, 10) : undefined;

  // Best-effort: pick up anything dropped straight into a Drive category
  // folder since the last time anyone opened this page.
  await syncReceiptsFromDrive(userId).catch(() => {});

  const where: Prisma.ExpenseWhereInput = {};
  if (categoryId === "uncategorized") where.categoryId = null;
  else if (categoryId) where.categoryId = categoryId;

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    where.expenseDate = { gte: start, lt: end };
  }

  if (reviewOnly) where.amount = null;

  const [categories, expenses, needsReviewCount] = await Promise.all([
    prisma.expenseCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.expense.findMany({
      where,
      orderBy: { expenseDate: "desc" },
      include: { category: true, createdBy: { select: { name: true, email: true } } },
      take: 500,
    }),
    prisma.expense.count({ where: { amount: null } }),
  ]);

  const total = expenses.reduce((sum, e) => sum + (e.amount ? Number(e.amount) : 0), 0);
  const currency = expenses[0]?.currency ?? "CAD";

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Expenses"
        description="Drop a receipt photo into its category's Drive folder, or add one here directly — everyone with a login sees the same shared record."
        action={
          <div className="flex flex-wrap gap-2">
            <form action={checkDriveNow}>
              <Button variant="secondary" type="submit">
                Check Drive now
              </Button>
            </form>
            <Link href="/expenses/reports">
              <Button variant="secondary">Monthly &amp; yearly report</Button>
            </Link>
            <Link href="/expenses/categories">
              <Button variant="secondary">Manage categories</Button>
            </Link>
            <Link href="/expenses/new">
              <Button>Add expense</Button>
            </Link>
          </div>
        }
      />

      {sp.added && (
        <div className="mb-6 rounded-xl border border-emerald-900 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-300">
          Expense added.
        </div>
      )}
      {sp.updated && (
        <div className="mb-6 rounded-xl border border-emerald-900 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-300">
          Expense updated.
        </div>
      )}
      {synced !== undefined && (
        <div className="mb-6 rounded-xl border border-emerald-900 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-300">
          {synced > 0
            ? `Found ${synced} new receipt${synced === 1 ? "" : "s"} in Drive.`
            : "No new receipts found in Drive."}
        </div>
      )}
      {needsReviewCount > 0 && !reviewOnly && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-amber-900 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
          <span>
            {needsReviewCount} receipt{needsReviewCount === 1 ? "" : "s"} dropped in Drive{" "}
            {needsReviewCount === 1 ? "needs" : "need"} an amount entered.
          </span>
          <Link href="/expenses?review=1" className="underline hover:text-amber-200">
            Review now
          </Link>
        </div>
      )}
      {reviewOnly && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-amber-900 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
          <span>Showing receipts that still need an amount.</span>
          <Link href="/expenses" className="underline hover:text-amber-200">
            Show all expenses
          </Link>
        </div>
      )}

      <Card className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            {categoryId || month ? "Filtered total" : "Total"}
          </p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {formatMoney(total, currency)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">{expenses.length} receipts</p>
        </div>
        <form className="flex flex-wrap items-end gap-3" method="get">
          <div>
            <label className="block text-xs font-medium text-neutral-400">Month</label>
            <input
              type="month"
              name="month"
              defaultValue={month}
              className="mt-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400">Category</label>
            <select
              name="category"
              defaultValue={categoryId ?? ""}
              className="mt-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            >
              <option value="">All categories</option>
              <option value="uncategorized">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
          {(categoryId || month) && (
            <Link href="/expenses" className="text-xs text-neutral-500 hover:text-neutral-300">
              Clear
            </Link>
          )}
        </form>
      </Card>

      {expenses.length === 0 ? (
        <Card className="text-center text-sm text-neutral-500">
          No expenses yet.{" "}
          <Link href="/expenses/new" className="text-violet-400 hover:text-violet-300">
            Add your first one
          </Link>
          .
        </Card>
      ) : (
        <ul className="space-y-2">
          {expenses.map((expense) => {
            const needsReview = expense.amount === null;
            return (
              <li key={expense.id}>
                <Card
                  className={`flex items-center gap-4 p-4 ${needsReview ? "border-amber-900" : ""}`}
                >
                  <Link
                    href={`/expenses/${expense.id}/edit`}
                    className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950"
                  >
                    <Image
                      src={expense.receiptUrl}
                      alt="Receipt"
                      fill
                      sizes="56px"
                      className="object-cover"
                      unoptimized
                    />
                  </Link>
                  <Link href={`/expenses/${expense.id}/edit`} className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-white">
                        {expense.vendor || "Untitled expense"}
                      </p>
                      <Badge tone={coerceBadgeTone(expense.category?.color)}>
                        {expense.category?.name ?? "Uncategorized"}
                      </Badge>
                      {needsReview && <Badge tone="amber">Needs review</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      {expense.expenseDate.toLocaleDateString()} &middot; added by{" "}
                      {expense.createdBy.name || expense.createdBy.email}
                      {expense.note ? ` · ${expense.note}` : ""}
                    </p>
                  </Link>
                  {needsReview ? (
                    <Link
                      href={`/expenses/${expense.id}/edit`}
                      className="shrink-0 text-sm font-medium text-amber-400 hover:text-amber-300"
                    >
                      Enter amount
                    </Link>
                  ) : (
                    <p className="shrink-0 text-sm font-semibold text-white">
                      {formatMoney(expense.amount!, expense.currency)}
                    </p>
                  )}
                  <form action={deleteExpense.bind(null, expense.id)}>
                    <button
                      type="submit"
                      className="shrink-0 text-xs text-neutral-500 hover:text-red-400"
                    >
                      Delete
                    </button>
                  </form>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
