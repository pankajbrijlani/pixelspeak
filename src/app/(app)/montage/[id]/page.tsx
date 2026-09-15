import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { PageHeader } from "@/lib/ui";
import { deleteMontageProject } from "@/lib/actions/montage";
import { MontageWorkspace } from "./workspace";

export default async function MontageProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();

  const project = await prisma.montageProject.findFirst({
    where: { id, userId },
    include: { assets: { orderBy: { captureOrder: "asc" } } },
  });
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={project.name}
        description={`Target length: ${project.targetDurationSec}s`}
        action={
          <form action={deleteMontageProject.bind(null, project.id)}>
            <button type="submit" className="text-sm text-red-400 hover:underline">
              Delete project
            </button>
          </form>
        }
      />

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
