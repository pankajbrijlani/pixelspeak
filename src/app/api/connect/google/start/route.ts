import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { createOAuthClient, GMAIL_SEND_SCOPES, isGoogleConfigured } from "@/lib/google";

function signState(userId: string) {
  const secret = process.env.NEXTAUTH_SECRET ?? "";
  const nonce = crypto.randomBytes(8).toString("hex");
  const payload = `${userId}.${nonce}`;
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

  const userId = (session.user as { id: string }).id;
  const client = createOAuthClient(req.nextUrl.origin);
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SEND_SCOPES,
    state: signState(userId),
  });

  return NextResponse.redirect(authUrl);
}
