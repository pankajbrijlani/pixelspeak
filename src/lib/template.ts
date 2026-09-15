import type { Lead } from "@prisma/client";

const TOKEN_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

export function personalize(text: string, lead: Lead): string {
  return text.replace(TOKEN_RE, (_match, key: string) => {
    const value = resolveToken(key, lead);
    return value ?? "";
  });
}

function resolveToken(key: string, lead: Lead): string | undefined {
  if (key === "firstName") return lead.firstName ?? "there";
  if (key === "lastName") return lead.lastName ?? "";
  if (key === "fullName") {
    return [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "there";
  }
  if (key === "email") return lead.email;
  if (key === "company") return lead.company ?? "";
  if (key === "title") return lead.title ?? "";
  if (key === "website") return lead.website ?? "";

  if (key.startsWith("custom.")) {
    const field = key.slice("custom.".length);
    const custom = lead.customFields as Record<string, string> | null;
    return custom?.[field] ?? "";
  }

  return undefined;
}

export const AVAILABLE_TOKENS = [
  "{{firstName}}",
  "{{lastName}}",
  "{{fullName}}",
  "{{company}}",
  "{{title}}",
  "{{website}}",
  "{{email}}",
];
