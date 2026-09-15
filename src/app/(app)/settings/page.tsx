import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { isGoogleConfigured } from "@/lib/google";
import { Card, PageHeader, Badge, Button } from "@/lib/ui";
import {
  removeEmailAccount,
  toggleEmailAccount,
  connectAdAccount,
  removeAdAccount,
} from "@/lib/actions/settings";

const ERROR_MESSAGES: Record<string, string> = {
  google_not_configured:
    "Google OAuth isn't configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your environment.",
  invalid_state: "That connection attempt expired or was invalid. Try again.",
  no_refresh_token:
    "Google didn't return a refresh token. Remove PixelSpeak Growth's access in your Google Account permissions, then reconnect.",
  oauth_failed: "Something went wrong connecting your Google account.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const userId = await requireUserId();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const connected = typeof params.connected === "string" ? params.connected : undefined;

  const [emailAccounts, adAccounts] = await Promise.all([
    prisma.emailAccount.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.adAccount.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Settings"
        description="Connect the mailbox that sends your cold emails and the Meta ad account that runs your campaigns."
      />

      {error && (
        <div className="mb-6 rounded-xl border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {ERROR_MESSAGES[error] ?? "Something went wrong."}
        </div>
      )}
      {connected && (
        <div className="mb-6 rounded-xl border border-emerald-900 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-300">
          Connected {connected}.
        </div>
      )}

      <Card className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Sending mailbox (Gmail)</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Cold emails send through your own Gmail account via the Gmail API, so they
              land in the same &ldquo;Sent&rdquo; folder as your normal email. We only request the
              gmail.send scope — we can&apos;t read your inbox.
            </p>
          </div>
          {isGoogleConfigured() ? (
            <a href="/api/connect/google/start">
              <Button variant="primary">Connect Gmail</Button>
            </a>
          ) : (
            <Badge tone="amber">Not configured</Badge>
          )}
        </div>

        {emailAccounts.length > 0 && (
          <ul className="mt-5 divide-y divide-neutral-800 border-t border-neutral-800">
            {emailAccounts.map((acct) => (
              <li key={acct.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm text-white">{acct.emailAddress}</p>
                  <p className="text-xs text-neutral-500">
                    Limit {acct.dailySendLimit}/day &middot;{" "}
                    {acct.isActive ? "Active" : "Paused"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <form action={toggleEmailAccount.bind(null, acct.id, !acct.isActive)}>
                    <Button variant="secondary" type="submit">
                      {acct.isActive ? "Pause" : "Resume"}
                    </Button>
                  </form>
                  <form action={removeEmailAccount.bind(null, acct.id)}>
                    <Button variant="danger" type="submit">
                      Remove
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-white">Meta ad account</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Paste a System User access token with <code>ads_management</code> scope from{" "}
          <span className="text-neutral-300">business.facebook.com &rarr; Business Settings &rarr; System Users</span>.
          Without this, ad campaigns are created as drafts only (no spend, nothing goes live).
        </p>

        <form action={connectAdAccount} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-1">
            <label className="block text-xs font-medium text-neutral-400">
              Ad account ID
            </label>
            <input
              name="adAccountId"
              placeholder="act_1234567890"
              required
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="block text-xs font-medium text-neutral-400">
              Business / label
            </label>
            <input
              name="businessName"
              placeholder="PixelSpeak"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="block text-xs font-medium text-neutral-400">
              Facebook Page ID
            </label>
            <input
              name="pageId"
              placeholder="123456789012345"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="block text-xs font-medium text-neutral-400">
              System user access token
            </label>
            <input
              name="accessToken"
              type="password"
              placeholder="EAAG..."
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">Save ad account</Button>
          </div>
        </form>

        {adAccounts.length > 0 && (
          <ul className="mt-5 divide-y divide-neutral-800 border-t border-neutral-800">
            {adAccounts.map((acct) => (
              <li key={acct.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm text-white">
                    {acct.businessName ?? acct.adAccountId}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {acct.adAccountId} &middot;{" "}
                    {acct.accessToken ? (
                      <span className="text-emerald-400">token connected</span>
                    ) : (
                      <span className="text-amber-400">draft mode (no token)</span>
                    )}
                  </p>
                </div>
                <form action={removeAdAccount.bind(null, acct.id)}>
                  <Button variant="danger" type="submit">
                    Remove
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
