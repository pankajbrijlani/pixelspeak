"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseLeadsCsv } from "@/lib/csv";
import { requireUserId } from "@/lib/session";
import {
  searchApolloPeople,
  revealApolloPerson,
  ApolloApiError,
  type ApolloProspect,
  type ApolloSearchParams,
} from "@/lib/apollo";

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

export type ProspectSearchResult =
  | { ok: true; prospects: ApolloProspect[]; totalEntries: number }
  | { ok: false; error: string };

export async function searchProspects(
  params: ApolloSearchParams
): Promise<ProspectSearchResult> {
  const userId = await requireUserId();
  const provider = await prisma.leadProvider.findFirst({
    where: { userId, provider: "apollo", isActive: true },
  });
  if (!provider) {
    return { ok: false, error: "Connect Apollo in Settings first." };
  }
  if (params.jobTitles.length === 0 && params.locations.length === 0 && !params.keywords) {
    return { ok: false, error: "Add at least a job title, location, or keyword." };
  }

  try {
    const result = await searchApolloPeople(provider, params);
    return { ok: true, ...result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof ApolloApiError ? err.message : "Apollo search failed.",
    };
  }
}

export type ImportProspectInput = {
  apolloId: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  company?: string;
  companyWebsite?: string;
  location?: string;
  linkedinUrl?: string;
};

export type ImportProspectsResult =
  | { ok: true; imported: number; skipped: number; listId: string }
  | { ok: false; error: string };

export async function importProspects(input: {
  listName: string;
  existingListId?: string;
  prospects: ImportProspectInput[];
}): Promise<ImportProspectsResult> {
  const userId = await requireUserId();
  const provider = await prisma.leadProvider.findFirst({
    where: { userId, provider: "apollo", isActive: true },
  });
  if (!provider) {
    return { ok: false, error: "Connect Apollo in Settings first." };
  }
  if (input.prospects.length === 0) {
    return { ok: false, error: "Select at least one prospect to import." };
  }

  let listId = input.existingListId;
  if (listId) {
    const owned = await prisma.leadList.findFirst({ where: { id: listId, userId } });
    if (!owned) return { ok: false, error: "List not found." };
  } else {
    const list = await prisma.leadList.create({
      data: {
        userId,
        name: input.listName || `Apollo search ${new Date().toLocaleDateString()}`,
        source: "apollo",
      },
    });
    listId = list.id;
  }

  let imported = 0;
  let skipped = 0;

  for (const prospect of input.prospects) {
    try {
      const { email } = await revealApolloPerson(provider, prospect.apolloId);
      if (!email) {
        skipped += 1;
        continue;
      }
      await prisma.lead.upsert({
        where: { leadListId_email: { leadListId: listId, email: email.toLowerCase() } },
        update: {},
        create: {
          leadListId: listId,
          email: email.toLowerCase(),
          firstName: prospect.firstName,
          lastName: prospect.lastName,
          company: prospect.company,
          title: prospect.title,
          website: prospect.companyWebsite,
          linkedinUrl: prospect.linkedinUrl,
        },
      });
      imported += 1;
    } catch {
      skipped += 1;
    }
  }

  revalidatePath("/leads");
  revalidatePath(`/leads/${listId}`);
  return { ok: true, imported, skipped, listId };
}
