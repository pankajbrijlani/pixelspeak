import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { Card, PageHeader, Badge } from "@/lib/ui";
import { createMontageProject } from "@/lib/actions/montage";
import type { MontageStatus } from "@prisma/client";

export default async function MontagePage() {
  const userId = await requireUserId();
  const projects = await prisma.montageProject.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { assets: true } } },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="AI Montage"
        description="Drop in raw footage and photos — it finds the good moments and dialogue, then cuts a montage with speed effects automatically."
      />

      <Card className="mb-6">
        <form action={createMontageProject} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs text-neutral-400">Project name</label>
            <input
              name="name"
              required
              placeholder="Toronto rooftop shoot"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            />
          </div>
          <div className="w-40">
            <label className="mb-1 block text-xs text-neutral-400">Target length (sec)</label>
            <input
              name="targetDurationSec"
              type="number"
              defaultValue={45}
              min={10}
              max={600}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500"
          >
            Create project
          </button>
        </form>
      </Card>

      {projects.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-400">No montage projects yet — create one above to get started.</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/montage/${p.id}`}>
                <Card className="flex items-center justify-between p-4 transition hover:border-neutral-700">
                  <div>
                    <p className="text-sm font-medium text-white">{p.name}</p>
                    <p className="text-xs text-neutral-500">
                      {p._count.assets} file{p._count.assets === 1 ? "" : "s"} &middot; target {p.targetDurationSec}s
                    </p>
                  </div>
                  <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function statusTone(status: MontageStatus): "neutral" | "green" | "amber" | "red" | "violet" {
  if (status === "DONE") return "green";
  if (status === "FAILED") return "red";
  if (status === "ANALYZING" || status === "RENDERING") return "violet";
  return "neutral";
}
