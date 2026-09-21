import { prisma } from "@/lib/prisma";
import { analyzeAsset } from "./analyze";
import { buildEdl } from "./edl";
import { renderProject } from "./render";

/**
 * Runs analyze -> select -> render end to end and updates the project's
 * status/errorMessage at each stage so the UI can poll for progress. A
 * single clip failing analysis doesn't sink the whole project — only an
 * empty result set does.
 */
export async function runMontagePipeline(projectId: string) {
  try {
    await prisma.montageProject.update({
      where: { id: projectId },
      data: { status: "ANALYZING", errorMessage: null },
    });

    // Re-analyzing an asset that already succeeded is pure waste — for large
    // source footage that's many minutes of redone work on every retry
    // (e.g. after a render-only failure). Analysis result is a pure
    // function of the file, which doesn't change once uploaded.
    const assets = await prisma.montageAsset.findMany({
      where: { projectId, status: { not: "READY" } },
    });
    for (const asset of assets) {
      await analyzeAsset(asset.id).catch((err) => {
        console.error(`[montage] analysis failed for asset ${asset.id}`, err);
      });
    }

    const readyCount = await prisma.montageAsset.count({ where: { projectId, status: "READY" } });
    if (readyCount === 0) {
      throw new Error("None of the uploaded files could be analyzed. Check the file formats and try again.");
    }

    await buildEdl(projectId);

    await prisma.montageProject.update({ where: { id: projectId }, data: { status: "RENDERING" } });
    await renderProject(projectId);

    await prisma.montageProject.update({ where: { id: projectId }, data: { status: "DONE" } });
  } catch (err) {
    console.error(`[montage] pipeline failed for project ${projectId}`, err);
    await prisma.montageProject.update({
      where: { id: projectId },
      data: { status: "FAILED", errorMessage: err instanceof Error ? err.message : String(err) },
    });
  }
}
