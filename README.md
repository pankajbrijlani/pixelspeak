# PixelSpeak Growth

A self-hosted lead gen tool for [pixelsspeak.com](https://pixelsspeak.com):
upload prospect lists, run multi-step cold email sequences through your own
Gmail account, and launch Meta (Facebook/Instagram) ad campaigns — all from
one dashboard.

## What it does

- **Leads** — import prospects from a CSV (email + optional name, company,
  title, website, phone, LinkedIn, and any custom columns). No scraping —
  bring your own list (exports from a data provider, a form, a spreadsheet
  you've built up).
- **Cold email** — build a multi-step sequence (initial email + timed
  follow-ups) with `{{firstName}}`, `{{company}}`, etc. personalization
  tokens. Emails send through your connected Gmail account via the Gmail
  API, on a schedule you control (days of week, hour window), so they land
  in your normal Sent folder and follow-ups thread as replies.
- **Meta ads** — draft a lead-gen/traffic/engagement/awareness campaign,
  then launch it to your Meta ad account (created paused, so nothing spends
  until you explicitly go live).
- **Dashboard** — leads, sent/open/reply rates, active campaigns and ads in
  one view.

It's built for one operator (you) rather than a public multi-tenant SaaS —
login is a single owner account you create yourself.

## Stack

Next.js (App Router) · TypeScript · Tailwind · Postgres + Prisma ·
NextAuth (credentials login) · Gmail API (googleapis) · Meta Marketing API
(Graph API) · Vercel Cron for the send scheduler.

## Setup

### 1. Install and configure

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

- `DATABASE_URL` — a Postgres connection string.
- `NEXTAUTH_SECRET` — random string, e.g. `openssl rand -base64 32`.
- `TOKEN_ENCRYPTION_KEY` — 32 random bytes, base64-encoded, e.g.
  `openssl rand -base64 32`. Used to encrypt Gmail/Meta tokens at rest.
- `CRON_SECRET` — random string that authorizes the send-scheduler endpoint.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — see below.
- `META_APP_ID` / `META_APP_SECRET` — only needed if you later want a full
  OAuth connect flow for Meta; the current build uses a pasted System User
  token instead (see below), so these are optional.

### 2. Database

```bash
npx prisma migrate deploy   # or `npx prisma migrate dev` in local dev
```

### 3. Create your login

There's no public sign-up — create your own account from the server:

```bash
npm run create-user -- you@pixelsspeak.com "a strong password" "Your Name"
```

### 4. Google Cloud project (for sending cold email via Gmail)

1. Go to [console.cloud.google.com](https://console.cloud.google.com),
   create a project.
2. **APIs & Services → Library** — enable the **Gmail API**.
3. **APIs & Services → OAuth consent screen** — set it up (External is
   fine; while it's in "Testing" mode, add your own Gmail address as a
   test user).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   — type **Web application**. Add an authorized redirect URI:
   - Local dev: `http://localhost:3000/api/connect/google/callback`
   - Production: `https://your-domain.com/api/connect/google/callback`
5. Copy the client ID/secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
6. In the app, go to **Settings → Connect Gmail** and approve access. We
   only request the `gmail.send` scope — the app can send on your behalf
   but can't read your inbox.

**Known limitation:** because we intentionally only request `gmail.send`
(not inbox read access), the app can't automatically detect when a lead
replies. Use the **"Mark replied"** button on a campaign's enrollment list
to stop follow-ups for that lead once they respond. If you'd rather have
automatic reply detection, that needs the `gmail.readonly` (or
`gmail.modify`) scope added — a reasonable next step, but a bigger trust
footprint on your inbox.

### 5. Meta ad account (optional, for Meta Ads)

The ads feature uses a Meta **System User access token** rather than a full
OAuth app-review flow (which requires Meta's business verification and app
review before you can manage ads for accounts you don't personally own —
overkill for driving your own account).

1. Go to [business.facebook.com](https://business.facebook.com) →
   **Business Settings**.
2. **Accounts → Ad Accounts** — note your ad account ID (`act_...`).
3. **Users → System Users** — create one, assign it your ad account with
   **Manage campaigns** permission, then generate a token with the
   `ads_management` scope.
4. **Accounts → Pages** — note the Page ID you want ads to run as.
5. In the app, go to **Settings** and paste the ad account ID, Page ID,
   and token.

Until you add a token, ad campaigns can still be drafted in the UI but the
**Launch** button stays disabled — nothing reaches Meta.

### 6. Run it

```bash
npm run dev
```

### 7. Sending on a schedule

Cold emails don't send instantly — a scheduler processes due sends. In
production this is a cron hitting `GET /api/cron/process-queue` with header
`Authorization: Bearer $CRON_SECRET`.

- **On Vercel:** `vercel.json` already defines a cron every 15 minutes.
  Vercel automatically sends the `Authorization: Bearer $CRON_SECRET`
  header when an env var named exactly `CRON_SECRET` is set in your
  project — just add it in the Vercel dashboard.
- **Elsewhere:** point any scheduler (cron, GitHub Actions, a cron SaaS) at
  that URL with the same header.

## How the send engine behaves

- Each campaign has a send window (days of week + hour range, in a
  timezone you set) — emails only go out inside that window.
- Each connected mailbox has a daily send limit (`EmailAccount.dailySendLimit`,
  default 80/day) to protect your Gmail account's deliverability/reputation.
- Follow-up steps send as replies in the same Gmail thread (`In-Reply-To`/
  `References` headers + Gmail `threadId`).
- A 1×1 tracking pixel is embedded to record opens (`EmailEvent` type
  `OPENED`). Click tracking isn't implemented yet.

## Project structure

```
prisma/schema.prisma        Data model (leads, campaigns, steps, ad campaigns, ...)
src/lib/mailer.ts            Gmail API sending
src/lib/meta.ts              Meta Marketing API calls
src/lib/campaign-engine.ts   Core scheduler: picks due sends, sends, reschedules
src/lib/schedule.ts          Timezone-aware send-window math
src/lib/template.ts          {{token}} personalization
src/lib/csv.ts                CSV → lead parsing/column mapping
src/lib/actions/*            Server actions (forms call these directly)
src/app/(app)/*              Authenticated pages (dashboard, leads, campaigns, ads, settings)
src/app/api/cron/*           Scheduler endpoint
src/app/api/connect/google/* Gmail OAuth connect flow
src/app/api/track/open/*     Open-tracking pixel
```

## Compliance note

Cold email and ad platforms have real rules (CAN-SPAM/CASL, Meta ad
policies). This tool doesn't file unsubscribe requests or add a
CASL-compliant footer/unsubscribe link for you — add one to your templates
and honor opt-outs (the `UNSUBSCRIBED` lead status is there for you to use).
