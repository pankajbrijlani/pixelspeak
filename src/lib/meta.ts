import type { AdAccount, AdCampaign } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

const OBJECTIVE_MAP: Record<string, string> = {
  LEAD_GENERATION: "OUTCOME_LEADS",
  TRAFFIC: "OUTCOME_TRAFFIC",
  ENGAGEMENT: "OUTCOME_ENGAGEMENT",
  AWARENESS: "OUTCOME_AWARENESS",
};

const OPTIMIZATION_GOAL_MAP: Record<string, string> = {
  LEAD_GENERATION: "LEAD_GENERATION",
  TRAFFIC: "LINK_CLICKS",
  ENGAGEMENT: "POST_ENGAGEMENT",
  AWARENESS: "REACH",
};

export class MetaApiError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = "MetaApiError";
  }
}

async function graphPost<T>(
  path: string,
  token: string,
  body: Record<string, unknown>
): Promise<T> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue;
    params.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  params.set("access_token", token);

  const res = await fetch(`${GRAPH_BASE}/${path}`, {
    method: "POST",
    body: params,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new MetaApiError(
      json?.error?.message ?? `Meta API request to ${path} failed`,
      json?.error
    );
  }
  return json as T;
}

export function isAdAccountConnected(account: AdAccount): boolean {
  return Boolean(account.accessToken);
}

// Creates the Campaign -> Ad Set -> Ad Creative -> Ad object graph in Meta,
// all in PAUSED state so nothing spends money until the user explicitly
// activates it from the dashboard.
export async function launchAdCampaignDraft(
  account: AdAccount,
  campaign: AdCampaign
): Promise<{ metaCampaignId: string; metaAdSetId: string; metaAdId: string }> {
  if (!account.accessToken) {
    throw new MetaApiError("This ad account has no access token connected.");
  }
  if (!account.pageId) {
    throw new MetaApiError("Add a Facebook Page ID to this ad account before launching ads.");
  }

  const token = decryptSecret(account.accessToken);
  const actId = account.adAccountId.startsWith("act_")
    ? account.adAccountId
    : `act_${account.adAccountId}`;

  const metaCampaign = await graphPost<{ id: string }>(`${actId}/campaigns`, token, {
    name: campaign.name,
    objective: OBJECTIVE_MAP[campaign.objective],
    status: "PAUSED",
    special_ad_categories: [],
  });

  const adSet = await graphPost<{ id: string }>(`${actId}/adsets`, token, {
    name: `${campaign.name} - Ad Set`,
    campaign_id: metaCampaign.id,
    daily_budget: campaign.dailyBudgetCents,
    billing_event: "IMPRESSIONS",
    optimization_goal: OPTIMIZATION_GOAL_MAP[campaign.objective],
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting: {
      geo_locations: { countries: campaign.targetLocations },
      age_min: campaign.targetAgeMin,
      age_max: campaign.targetAgeMax,
      flexible_spec: campaign.targetInterests.length
        ? [{ interests: campaign.targetInterests.map((name) => ({ name })) }]
        : undefined,
    },
    status: "PAUSED",
  });

  const creative = await graphPost<{ id: string }>(`${actId}/adcreatives`, token, {
    name: `${campaign.name} - Creative`,
    object_story_spec: {
      page_id: account.pageId,
      link_data: {
        message: campaign.primaryText ?? "",
        link: campaign.destinationUrl ?? "https://pixelsspeak.com",
        name: campaign.headline ?? campaign.name,
        picture: campaign.imageUrl ?? undefined,
        call_to_action: { type: "LEARN_MORE" },
      },
    },
  });

  const ad = await graphPost<{ id: string }>(`${actId}/ads`, token, {
    name: `${campaign.name} - Ad`,
    adset_id: adSet.id,
    creative: { creative_id: creative.id },
    status: "PAUSED",
  });

  return { metaCampaignId: metaCampaign.id, metaAdSetId: adSet.id, metaAdId: ad.id };
}

export async function setMetaAdStatus(
  account: AdAccount,
  metaCampaignId: string,
  status: "ACTIVE" | "PAUSED"
): Promise<void> {
  if (!account.accessToken) {
    throw new MetaApiError("This ad account has no access token connected.");
  }
  const token = decryptSecret(account.accessToken);
  await graphPost(`${metaCampaignId}`, token, { status });
}
