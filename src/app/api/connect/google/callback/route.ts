import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { google } from "googleapis";
import { auth } from "@/lib/auth";
import { createOAuthClient } from "@/lib/google";
import { findOrCreateReceiptsFolder, backfillCategoryFolders, DRIVE_CONNECTION_ID } from "@/lib/drive";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";

type Purpose = "gmail" | "drive";

function verifyState(state: string): { userId: string; purpose: Purpose } | null {
  const secret = process.env.NEXTAUTH_SECRET ?? "";
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [userId, purpose, nonce, sig] = parts;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${userId}.${purpose}.${nonce}`)
    .digest("hex");
  const expectedBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(sig);
  if (expectedBuf.length !== sigBuf.length || !crypto.timingSafeEqual(expectedBuf, sigBuf)) {
    return null;
  }
  if (purpose !== "gmail" && purpose !== "drive") return null;
  return { userId, purpose };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  const settingsUrl = new URL("/settings", req.nextUrl.origin);
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    settingsUrl.searchParams.set("error", error);
    return NextResponse.redirect(settingsUrl);
  }

  const sessionUserId = (session.user as { id: string }).id;
  const parsedState = state ? verifyState(state) : null;

  if (!code || !parsedState || parsedState.userId !== sessionUserId) {
    settingsUrl.searchParams.set("error", "invalid_state");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const client = createOAuthClient(req.nextUrl.origin);
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ auth: client, version: "v2" });
    const { data: profile } = await oauth2.userinfo.get();

    if (!profile.email) {
      throw new Error("Google did not return an email address");
    }
    if (!tokens.refresh_token) {
      settingsUrl.searchParams.set("error", "no_refresh_token");
      return NextResponse.redirect(settingsUrl);
    }

    if (parsedState.purpose === "drive") {
      const { folderId, folderUrl } = await findOrCreateReceiptsFolder(client);
      await prisma.driveConnection.upsert({
        where: { id: DRIVE_CONNECTION_ID },
        update: {
          connectedEmail: profile.email,
          folderId,
          folderUrl,
          refreshToken: encryptSecret(tokens.refresh_token),
          accessToken: tokens.access_token ? encryptSecret(tokens.access_token) : null,
          tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          connectedById: sessionUserId,
        },
        create: {
          id: DRIVE_CONNECTION_ID,
          connectedEmail: profile.email,
          folderId,
          folderUrl,
          refreshToken: encryptSecret(tokens.refresh_token),
          accessToken: tokens.access_token ? encryptSecret(tokens.access_token) : null,
          tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          connectedById: sessionUserId,
        },
      });
      await backfillCategoryFolders();
    } else {
      await prisma.emailAccount.upsert({
        where: {
          userId_emailAddress: {
            userId: sessionUserId,
            emailAddress: profile.email,
          },
        },
        update: {
          refreshToken: encryptSecret(tokens.refresh_token),
          accessToken: tokens.access_token ? encryptSecret(tokens.access_token) : null,
          tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          displayName: profile.name ?? undefined,
          isActive: true,
        },
        create: {
          userId: sessionUserId,
          provider: "google",
          emailAddress: profile.email,
          displayName: profile.name ?? undefined,
          refreshToken: encryptSecret(tokens.refresh_token),
          accessToken: tokens.access_token ? encryptSecret(tokens.access_token) : null,
          tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        },
      });
    }

    settingsUrl.searchParams.set("connected", profile.email);
    return NextResponse.redirect(settingsUrl);
  } catch (err) {
    console.error("Google OAuth callback failed", err);
    settingsUrl.searchParams.set("error", "oauth_failed");
    return NextResponse.redirect(settingsUrl);
  }
}
