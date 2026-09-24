import type { LeadProvider } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";

const API_BASE = "https://api.hunter.io/v2";

export class HunterApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "HunterApiError";
  }
}

export type HunterEmail = {
  value: string;
  type: "personal" | "generic";
  confidence: number;
  firstName?: string;
  lastName?: string;
  position?: string;
};

type DomainSearchResponse = {
  data?: {
    emails?: Array<{
      value: string;
      type: string;
      confidence: number;
      first_name?: string | null;
      last_name?: string | null;
      position?: string | null;
    }>;
  };
  errors?: Array<{ details?: string }>;
};

export function extractDomain(url: string): string | null {
  try {
    const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const hostname = new URL(withProtocol).hostname;
    return hostname.replace(/^www\./i, "") || null;
  } catch {
    return null;
  }
}

export async function domainSearch(
  provider: LeadProvider,
  domain: string
): Promise<HunterEmail[]> {
  const apiKey = decryptSecret(provider.apiKey);
  const url = `${API_BASE}/domain-search?domain=${encodeURIComponent(domain)}&api_key=${encodeURIComponent(apiKey)}&limit=5`;

  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as DomainSearchResponse;

  if (!res.ok) {
    const message = json.errors?.[0]?.details ?? `Hunter.io request failed (${res.status})`;
    throw new HunterApiError(message, res.status);
  }

  return (json.data?.emails ?? []).map((e) => ({
    value: e.value,
    type: e.type === "personal" ? "personal" : "generic",
    confidence: e.confidence,
    firstName: e.first_name ?? undefined,
    lastName: e.last_name ?? undefined,
    position: e.position ?? undefined,
  }));
}

// Picks the single best contact for a business: a named person over a
// generic inbox, highest confidence within each tier.
export function pickBestEmail(emails: HunterEmail[]): HunterEmail | null {
  if (emails.length === 0) return null;
  const sorted = [...emails].sort((a, b) => {
    if (a.type !== b.type) return a.type === "personal" ? -1 : 1;
    return b.confidence - a.confidence;
  });
  return sorted[0];
}
