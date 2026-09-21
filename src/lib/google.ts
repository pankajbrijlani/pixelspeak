import { google } from "googleapis";

export const GMAIL_SEND_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

// drive.file: the app can only see/manage files *it* creates (the receipts
// it uploads) — not the rest of the connected account's Drive.
export const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

export function getGoogleRedirectUri(origin: string) {
  return `${origin}/api/connect/google/callback`;
}

function getGoogleCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured"
    );
  }
  return { clientId, clientSecret };
}

export function createOAuthClient(origin: string) {
  const { clientId, clientSecret } = getGoogleCredentials();
  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    getGoogleRedirectUri(origin)
  );
}

// For refreshing/using an already-issued token (e.g. server-side Drive
// calls that aren't part of the interactive OAuth redirect flow) — no
// redirect URI needed since we're not generating an auth/consent URL.
export function createBareOAuthClient() {
  const { clientId, clientSecret } = getGoogleCredentials();
  return new google.auth.OAuth2(clientId, clientSecret);
}

export function isGoogleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
