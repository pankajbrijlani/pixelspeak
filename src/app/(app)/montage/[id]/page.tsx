import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { deleteMontageProject } from "@/lib/actions/montage";
import { MontageWorkspace } from "./workspace";
import { TrashIcon } from "../icons";

export default async function MontageProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();

  const project = await prisma.montageProject.findFirst({
    where: { id, userId },
    include: { assets: { orderBy: { captureOrder: "asc" } } },
  });
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <Link href="/montage" className="text-xs text-neutral-500 hover:text-neutral-300">
            &larr; All projects
          </Link>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-white">{project.name}</h1>
          <p className="text-sm text-neutral-400">Target length: {project.targetDurationSec}s</p>
        </div>
        <form action={deleteMontageProject.bind(null, project.id)}>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-neutral-500 transition hover:bg-red-500/10 hover:text-red-400"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            Delete
          </button>
        </form>
      </div>

      <MontageWorkspace
        projectId={project.id}
        initialAssets={project.assets.map((a) => ({
          id: a.id,
          originalName: a.originalName,
          type: a.type,
          status: a.status,
        }))}
        initialStatus={project.status}
        initialHasOutput={Boolean(project.outputPath)}
      />
    </div>
  );
}
