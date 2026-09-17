import type { LeadProvider } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";

const API_BASE = "https://api.apollo.io/api/v1";

export class ApolloApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "ApolloApiError";
  }
}

export type ApolloSearchParams = {
  jobTitles: string[];
  locations: string[];
  keywords?: string;
  page?: number;
  perPage?: number;
};

export type ApolloProspect = {
  apolloId: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  company?: string;
  companyWebsite?: string;
  location?: string;
  linkedinUrl?: string;
  emailStatus: "verified" | "guessed" | "unavailable" | "locked";
};

async function apolloRequest<T>(
  provider: LeadProvider,
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const apiKey = decryptSecret(provider.apiKey);

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      json?.error_message ?? json?.message ?? `Apollo API request failed (${res.status})`;
    throw new ApolloApiError(message, res.status);
  }

  return json as T;
}

type ApolloPersonRaw = {
  id: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  city?: string;
  state?: string;
  country?: string;
  linkedin_url?: string;
  email?: string | null;
  email_status?: string;
  organization?: { name?: string; website_url?: string } | null;
};

function toProspect(person: ApolloPersonRaw): ApolloProspect {
  const location = [person.city, person.state, person.country].filter(Boolean).join(", ");
  const hasRevealedEmail = Boolean(person.email) && person.email_status !== "locked";

  return {
    apolloId: person.id,
    firstName: person.first_name,
    lastName: person.last_name,
    title: person.title,
    company: person.organization?.name,
    companyWebsite: person.organization?.website_url,
    location: location || undefined,
    linkedinUrl: person.linkedin_url,
    emailStatus: hasRevealedEmail
      ? (person.email_status as "verified" | "guessed") ?? "verified"
      : "locked",
  };
}

export async function searchApolloPeople(
  provider: LeadProvider,
  params: ApolloSearchParams
): Promise<{ prospects: ApolloProspect[]; totalEntries: number }> {
  const data = await apolloRequest<{
    people: ApolloPersonRaw[];
    pagination?: { total_entries?: number };
  }>(provider, "/mixed_people/search", {
    person_titles: params.jobTitles,
    person_locations: params.locations,
    q_keywords: params.keywords || undefined,
    page: params.page ?? 1,
    per_page: params.perPage ?? 25,
  });

  return {
    prospects: (data.people ?? []).map(toProspect),
    totalEntries: data.pagination?.total_entries ?? data.people?.length ?? 0,
  };
}

// Reveals a single contact's email, consuming one Apollo export credit.
// Call this only for prospects the user has explicitly selected to import.
export async function revealApolloPerson(
  provider: LeadProvider,
  apolloId: string
): Promise<{ email: string | null; emailStatus: string }> {
  const data = await apolloRequest<{ person: ApolloPersonRaw }>(provider, "/people/match", {
    id: apolloId,
    reveal_personal_emails: false,
  });

  return {
    email: data.person?.email ?? null,
    emailStatus: data.person?.email_status ?? "unavailable",
  };
}
