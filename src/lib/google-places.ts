import type { LeadProvider } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.websiteUri",
  "places.nationalPhoneNumber",
].join(",");

export class GooglePlacesApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "GooglePlacesApiError";
  }
}

export type PlaceResult = {
  placeId: string;
  name: string;
  address?: string;
  website?: string;
  phone?: string;
};

type PlacesSearchTextResponse = {
  places?: Array<{
    id: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    websiteUri?: string;
    nationalPhoneNumber?: string;
  }>;
};

export async function searchPlaces(
  provider: LeadProvider,
  params: { category: string; location: string }
): Promise<PlaceResult[]> {
  const apiKey = decryptSecret(provider.apiKey);
  const textQuery = params.location
    ? `${params.category} in ${params.location}`
    : params.category;

  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({ textQuery, maxResultCount: 20 }),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      json?.error?.message ?? `Google Places request failed (${res.status})`;
    throw new GooglePlacesApiError(message, res.status);
  }

  const data = json as PlacesSearchTextResponse;
  return (data.places ?? []).map((place) => ({
    placeId: place.id,
    name: place.displayName?.text ?? "Unnamed business",
    address: place.formattedAddress,
    website: place.websiteUri,
    phone: place.nationalPhoneNumber,
  }));
}
