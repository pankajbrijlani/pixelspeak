"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { rm } from "node:fs/promises";
import { projectDir } from "@/lib/montage/storage";

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  targetDurationSec: z.number().int().min(10).max(600),
});

export async function createMontageProject(formData: FormData) {
  const userId = await requireUserId();

  const parsed = createProjectSchema.parse({
    name: String(formData.get("name") ?? "Untitled montage"),
    targetDurationSec: Number(formData.get("targetDurationSec") ?? 45),
  });

  const project = await prisma.montageProject.create({
    data: { userId, name: parsed.name, targetDurationSec: parsed.targetDurationSec },
  });

  redirect(`/montage/${project.id}`);
}

export async function deleteMontageProject(projectId: string) {
  const userId = await requireUserId();
  const project = await prisma.montageProject.findFirst({ where: { id: projectId, userId } });
  if (!project) throw new Error("Project not found");

  await prisma.montageProject.delete({ where: { id: projectId } });
  await rm(projectDir(projectId), { recursive: true, force: true });

  revalidatePath("/montage");
  redirect("/montage");
}
