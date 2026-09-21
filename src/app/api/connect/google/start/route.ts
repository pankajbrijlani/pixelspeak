import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import {
  createOAuthClient,
  GMAIL_SEND_SCOPES,
  DRIVE_SCOPES,
  isGoogleConfigured,
} from "@/lib/google";

type Purpose = "gmail" | "drive";

function signState(userId: string, purpose: Purpose) {
  const secret = process.env.NEXTAUTH_SECRET ?? "";
  const nonce = crypto.randomBytes(8).toString("hex");
  const payload = `${userId}.${purpose}.${nonce}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  if (!isGoogleConfigured()) {
    const url = new URL("/settings", req.nextUrl.origin);
    url.searchParams.set("error", "google_not_configured");
    return NextResponse.redirect(url);
  }

  const purpose: Purpose = req.nextUrl.searchParams.get("purpose") === "drive" ? "drive" : "gmail";
  const scopes = purpose === "drive" ? DRIVE_SCOPES : GMAIL_SEND_SCOPES;

  const userId = (session.user as { id: string }).id;
  const client = createOAuthClient(req.nextUrl.origin);
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
    state: signState(userId, purpose),
  });

  return NextResponse.redirect(authUrl);
}
