import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { Card, PageHeader, Badge, Button } from "@/lib/ui";
import {
  createExpenseCategory,
  renameExpenseCategory,
  deleteExpenseCategory,
} from "@/lib/actions/expense-categories";

const COLORS = ["violet", "green", "amber", "red", "neutral"] as const;
type BadgeColor = (typeof COLORS)[number];
function badgeTone(color: string): BadgeColor {
  return (COLORS as readonly string[]).includes(color) ? (color as BadgeColor) : "neutral";
}

export default async function ExpenseCategoriesPage() {
  await requireUserId();
  const categories = await prisma.expenseCategory.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { expenses: true } } },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/expenses" className="text-xs text-neutral-500 hover:text-neutral-300">
        &larr; Expenses
      </Link>
      <PageHeader
        title="Categories"
        description="Add, rename, or delete categories. Deleting one doesn't delete its expenses — they move to Uncategorized."
      />

      <Card className="mb-6">
        <h2 className="text-sm font-semibold text-white">New category</h2>
        <form action={createExpenseCategory} className="mt-3 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-neutral-400">Name</label>
            <input
              name="name"
              required
              placeholder="e.g. Props & Wardrobe"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400">Color</label>
            <select
              name="color"
              defaultValue="violet"
              className="mt-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            >
              {COLORS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">Add</Button>
        </form>
      </Card>

      <ul className="space-y-2">
        {categories.map((category) => (
          <li key={category.id}>
            <Card className="p-4">
              <form
                action={renameExpenseCategory.bind(null, category.id)}
                className="flex flex-wrap items-end gap-3"
              >
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs font-medium text-neutral-400">Name</label>
                  <input
                    name="name"
                    required
                    defaultValue={category.name}
                    className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400">Color</label>
                  <select
                    name="color"
                    defaultValue={category.color}
                    className="mt-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
                  >
                    {COLORS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <Badge tone={badgeTone(category.color)}>{category._count.expenses} expenses</Badge>
                <Button type="submit" variant="secondary">
                  Save
                </Button>
              </form>
              <form action={deleteExpenseCategory.bind(null, category.id)} className="mt-2">
                <button type="submit" className="text-xs text-neutral-500 hover:text-red-400">
                  Delete category
                </button>
              </form>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
