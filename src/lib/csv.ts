import Papa from "papaparse";

export type ParsedLead = {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  website?: string;
  phone?: string;
  linkedinUrl?: string;
  customFields?: Record<string, string>;
};

const FIELD_ALIASES: Record<keyof Omit<ParsedLead, "customFields">, string[]> = {
  email: ["email", "e-mail", "email address", "work email"],
  firstName: ["firstname", "first name", "first"],
  lastName: ["lastname", "last name", "last", "surname"],
  company: ["company", "company name", "organization", "org"],
  title: ["title", "job title", "role", "position"],
  website: ["website", "domain", "company website", "url"],
  phone: ["phone", "phone number", "mobile"],
  linkedinUrl: ["linkedin", "linkedin url", "linkedin profile"],
};

function normalizeHeader(header: string) {
  return header.trim().toLowerCase();
}

export function parseLeadsCsv(csvText: string): {
  leads: ParsedLead[];
  skipped: number;
  headers: string[];
} {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = result.meta.fields ?? [];
  const headerMap = new Map<string, string>();
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.includes(normalized)) {
        headerMap.set(field, header);
      }
    }
  }

  const knownHeaders = new Set(headerMap.values());
  const leads: ParsedLead[] = [];
  let skipped = 0;

  for (const row of result.data) {
    const emailHeader = headerMap.get("email");
    const email = emailHeader ? row[emailHeader]?.trim().toLowerCase() : undefined;
    if (!email || !email.includes("@")) {
      skipped += 1;
      continue;
    }

    const customFields: Record<string, string> = {};
    for (const header of headers) {
      if (!knownHeaders.has(header) && row[header]) {
        customFields[header] = row[header];
      }
    }

    leads.push({
      email,
      firstName: getField(row, headerMap, "firstName"),
      lastName: getField(row, headerMap, "lastName"),
      company: getField(row, headerMap, "company"),
      title: getField(row, headerMap, "title"),
      website: getField(row, headerMap, "website"),
      phone: getField(row, headerMap, "phone"),
      linkedinUrl: getField(row, headerMap, "linkedinUrl"),
      customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
    });
  }

  return { leads, skipped, headers };
}

function getField(
  row: Record<string, string>,
  headerMap: Map<string, string>,
  field: string
): string | undefined {
  const header = headerMap.get(field);
  if (!header) return undefined;
  const value = row[header]?.trim();
  return value ? value : undefined;
}
