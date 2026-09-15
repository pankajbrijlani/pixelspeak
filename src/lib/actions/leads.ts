"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseLeadsCsv } from "@/lib/csv";
import { requireUserId } from "@/lib/session";

export async function uploadLeadsCsv(formData: FormData) {
  const userId = await requireUserId();
  const file = formData.get("file");
  const listNameInput = String(formData.get("listName") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Please choose a CSV file to upload");
  }

  const csvText = await file.text();
  const { leads, skipped } = parseLeadsCsv(csvText);

  if (leads.length === 0) {
    throw new Error(
      "No valid rows found. Make sure your CSV has an 'email' column."
    );
  }

  const listName =
    listNameInput || file.name.replace(/\.csv$/i, "") || `Import ${new Date().toLocaleDateString()}`;

  const list = await prisma.leadList.create({
    data: { userId, name: listName, source: "csv" },
  });

  await prisma.lead.createMany({
    data: leads.map((lead) => ({
      leadListId: list.id,
      email: lead.email,
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company,
      title: lead.title,
      website: lead.website,
      phone: lead.phone,
      linkedinUrl: lead.linkedinUrl,
      customFields: lead.customFields,
    })),
    skipDuplicates: true,
  });

  revalidatePath("/leads");
  redirect(`/leads/${list.id}?imported=${leads.length}&skipped=${skipped}`);
}

export async function deleteLeadList(id: string) {
  const userId = await requireUserId();
  await prisma.leadList.deleteMany({ where: { id, userId } });
  revalidatePath("/leads");
}

export async function deleteLead(id: string, listId: string) {
  const userId = await requireUserId();
  const list = await prisma.leadList.findFirst({ where: { id: listId, userId } });
  if (!list) throw new Error("Not found");
  await prisma.lead.delete({ where: { id } });
  revalidatePath(`/leads/${listId}`);
}
