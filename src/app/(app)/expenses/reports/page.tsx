import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { Card, PageHeader, Badge, Button, coerceBadgeTone } from "@/lib/ui";
import { formatMoney } from "@/lib/money";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type CategoryRow = {
  id: string;
  name: string;
  color: string | null;
  months: number[]; // index 0 = January
  total: number;
};

export default async function ExpenseReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireUserId();
  const sp = await searchParams;

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const requestedYear = typeof sp.year === "string" ? parseInt(sp.year, 10) : currentYear;
  const selectedYear = Number.isFinite(requestedYear) ? requestedYear : currentYear;

  const [years, expenses] = await Promise.all([
    prisma.$queryRaw<{ year: number }[]>`
      SELECT DISTINCT EXTRACT(YEAR FROM "expenseDate")::int AS year
      FROM "Expense"
      ORDER BY year DESC
    `,
    prisma.expense.findMany({
      where: {
        expenseDate: {
          gte: new Date(Date.UTC(selectedYear, 0, 1)),
          lt: new Date(Date.UTC(selectedYear + 1, 0, 1)),
        },
      },
      include: { category: true },
    }),
  ]);

  const yearOptions = years.map((y) => y.year);
  if (!yearOptions.includes(currentYear)) yearOptions.unshift(currentYear);
  yearOptions.sort((a, b) => b - a);

  const rows = new Map<string, CategoryRow>();
  const monthTotals = new Array(12).fill(0);
  let yearTotal = 0;
  const currency = expenses[0]?.currency ?? "CAD";

  for (const expense of expenses) {
    const key = expense.categoryId ?? "uncategorized";
    if (!rows.has(key)) {
      rows.set(key, {
        id: key,
        name: expense.category?.name ?? "Uncategorized",
        color: expense.category?.color ?? null,
        months: new Array(12).fill(0),
        total: 0,
      });
    }
    const row = rows.get(key)!;
    const monthIndex = expense.expenseDate.getUTCMonth();
    const amount = Number(expense.amount);
    row.months[monthIndex] += amount;
    row.total += amount;
    monthTotals[monthIndex] += amount;
    yearTotal += amount;
  }

  const sortedRows = [...rows.values()].sort((a, b) => b.total - a.total);
  const currentMonthIndex =
    selectedYear === currentYear ? now.getUTCMonth() : -1;

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/expenses" className="text-xs text-neutral-500 hover:text-neutral-300">
        &larr; Expenses
      </Link>
      <PageHeader
        title="Monthly & yearly report"
        description="Every category's spend broken down by month, for any year you've logged expenses in."
        action={
          <form method="get" className="flex items-end gap-2">
            <div>
              <label className="block text-xs font-medium text-neutral-400">Year</label>
              <select
                name="year"
                defaultValue={selectedYear}
                className="mt-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="secondary">
              View
            </Button>
          </form>
        }
      />

      <Card className="mb-6">
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          {selectedYear} total
        </p>
        <p className="mt-1 text-2xl font-semibold text-white">
          {formatMoney(yearTotal, currency)}
        </p>
      </Card>

      {sortedRows.length === 0 ? (
        <Card className="text-center text-sm text-neutral-500">
          No expenses logged in {selectedYear}.
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-xs uppercase tracking-wide text-neutral-500">
                <th className="sticky left-0 bg-neutral-900 px-4 py-3">Category</th>
                {MONTH_LABELS.map((label, i) => (
                  <th
                    key={label}
                    className={`px-3 py-3 text-right ${
                      i === currentMonthIndex ? "text-violet-400" : ""
                    }`}
                  >
                    {label}
                  </th>
                ))}
                <th className="px-4 py-3 text-right">Year</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {sortedRows.map((row) => (
                <tr key={row.id}>
                  <td className="sticky left-0 whitespace-nowrap bg-neutral-900 px-4 py-3">
                    <Badge tone={coerceBadgeTone(row.color)}>{row.name}</Badge>
                  </td>
                  {row.months.map((amount, i) => (
                    <td
                      key={i}
                      className={`px-3 py-3 text-right ${
                        amount ? "text-neutral-200" : "text-neutral-700"
                      } ${i === currentMonthIndex ? "bg-violet-500/5" : ""}`}
                    >
                      {amount ? formatMoney(amount, currency) : "—"}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right font-semibold text-white">
                    {formatMoney(row.total, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-neutral-800 text-sm font-semibold">
                <td className="sticky left-0 bg-neutral-900 px-4 py-3 text-white">
                  All categories
                </td>
                {monthTotals.map((amount, i) => (
                  <td
                    key={i}
                    className={`px-3 py-3 text-right text-white ${
                      i === currentMonthIndex ? "bg-violet-500/5" : ""
                    }`}
                  >
                    {amount ? formatMoney(amount, currency) : "—"}
                  </td>
                ))}
                <td className="px-4 py-3 text-right text-white">
                  {formatMoney(yearTotal, currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </div>
  );
}
