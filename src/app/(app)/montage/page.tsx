import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { Card } from "@/lib/ui";
import { createMontageProject } from "@/lib/actions/montage";
import type { MontageStatus } from "@prisma/client";
import { CheckCircleIcon, ErrorCircleIcon, FilmIcon, SparklesIcon, SpinnerIcon } from "./icons";

const DURATION_PRESETS = [30, 45, 60, 90];

export default async function MontagePage() {
  const userId = await requireUserId();
  const projects = await prisma.montageProject.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { assets: true } } },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400">
          <SparklesIcon className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-white">AI Montage</h1>
          <p className="text-sm text-neutral-400">
            Drop in raw footage and photos — it finds the good moments and cuts a montage automatically.
          </p>
        </div>
      </div>

      <Card className="mb-8">
        <form action={createMontageProject} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-400">Project name</label>
            <input
              name="name"
              required
              placeholder="Toronto rooftop shoot"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-violet-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-400">Target length</label>
            <div className="flex flex-wrap gap-2">
              {DURATION_PRESETS.map((sec, i) => (
                <label key={sec} className="cursor-pointer">
                  <input
                    type="radio"
                    name="targetDurationSec"
                    value={sec}
                    defaultChecked={i === 1}
                    className="peer sr-only"
                  />
                  <span className="inline-block rounded-full border border-neutral-700 px-3.5 py-1.5 text-sm text-neutral-300 transition peer-checked:border-violet-500 peer-checked:bg-violet-500/15 peer-checked:text-violet-300 hover:border-neutral-500">
                    {sec}s
                  </span>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-500 sm:w-auto"
          >
            Create project
          </button>
        </form>
      </Card>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-800 py-12 text-center">
          <p className="text-sm text-neutral-500">No montage projects yet — create one above to get started.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/montage/${p.id}`}>
                <Card className="flex items-center justify-between gap-4 p-4 transition hover:border-neutral-600">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-neutral-400">
                      <FilmIcon />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{p.name}</p>
                      <p className="text-xs text-neutral-500">
                        {p._count.assets} file{p._count.assets === 1 ? "" : "s"} &middot; {p.targetDurationSec}s target
                        &middot; {formatDistanceToNow(p.createdAt, { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <StatusPill status={p.status} />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: MontageStatus }) {
  const map: Record<MontageStatus, { label: string; className: string; icon: React.ReactNode }> = {
    DRAFT: { label: "Draft", className: "bg-neutral-800 text-neutral-300", icon: null },
    ANALYZING: {
      label: "Analyzing",
      className: "bg-violet-500/15 text-violet-300",
      icon: <SpinnerIcon className="h-3.5 w-3.5" />,
    },
    RENDERING: {
      label: "Rendering",
      className: "bg-violet-500/15 text-violet-300",
      icon: <SpinnerIcon className="h-3.5 w-3.5" />,
    },
    DONE: {
      label: "Ready",
      className: "bg-emerald-500/15 text-emerald-400",
      icon: <CheckCircleIcon className="h-3.5 w-3.5" />,
    },
    FAILED: {
      label: "Failed",
      className: "bg-red-500/15 text-red-400",
      icon: <ErrorCircleIcon className="h-3.5 w-3.5" />,
    },
  };
  const { label, className, icon } = map[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>
      {icon}
      {label}
    </span>
  );
}
