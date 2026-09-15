import { google } from "googleapis";
import type { EmailAccount } from "@prisma/client";
import { createOAuthClient } from "@/lib/google";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  inReplyToMessageId?: string | null;
  threadId?: string | null;
};

export type SendEmailResult = {
  messageId: string;
  threadId: string;
};

// Refreshes the access token if needed and returns an authorized OAuth2 client
// for this mailbox. `origin` only matters for the redirect_uri parameter,
// which is unused for token refresh, so any value works here.
async function getAuthorizedClient(account: EmailAccount) {
  if (!account.refreshToken) {
    throw new Error(`Email account ${account.emailAddress} has no refresh token`);
  }

  const client = createOAuthClient(process.env.NEXTAUTH_URL ?? "http://localhost:3000");
  client.setCredentials({
    refresh_token: decryptSecret(account.refreshToken),
  });

  const { credentials } = await client.refreshAccessToken();
  client.setCredentials(credentials);

  await prisma.emailAccount.update({
    where: { id: account.id },
    data: {
      accessToken: credentials.access_token
        ? encryptSecret(credentials.access_token)
        : undefined,
      tokenExpiresAt: credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : undefined,
    },
  });

  return client;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildRawMessage(from: string, input: SendEmailInput): string {
  const headers = [
    `From: ${from}`,
    `To: ${input.to}`,
    `Subject: ${encodeSubject(input.subject)}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `MIME-Version: 1.0`,
  ];

  if (input.inReplyToMessageId) {
    headers.push(`In-Reply-To: ${input.inReplyToMessageId}`);
    headers.push(`References: ${input.inReplyToMessageId}`);
  }

  return `${headers.join("\r\n")}\r\n\r\n${input.html}`;
}

function encodeSubject(subject: string): string {
  // RFC 2047 encoded-word for non-ASCII subjects.
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

export async function sendViaGmail(
  account: EmailAccount,
  input: SendEmailInput
): Promise<SendEmailResult> {
  const client = await getAuthorizedClient(account);
  const gmail = google.gmail({ version: "v1", auth: client });

  const raw = base64UrlEncode(buildRawMessage(account.emailAddress, input));

  const { data } = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      threadId: input.threadId ?? undefined,
    },
  });

  if (!data.id || !data.threadId) {
    throw new Error("Gmail API did not return a message id");
  }

  return { messageId: data.id, threadId: data.threadId };
}
