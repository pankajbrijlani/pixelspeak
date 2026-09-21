# PixelSpeak Growth

A self-hosted lead gen tool for [pixelsspeak.com](https://pixelsspeak.com):
upload prospect lists, run multi-step cold email sequences through your own
Gmail account, and launch Meta (Facebook/Instagram) ad campaigns — all from
one dashboard.

## What it does

- **Leads** — either search Apollo.io by job title/location/keyword to find
  new prospects, or import a CSV you already have (email + optional name,
  company, title, website, phone, LinkedIn, and any custom columns). No
  scraping — sourcing goes through Apollo's own API or a list you bring, not
  us pulling data off LinkedIn/Google against their terms.
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
- **Expenses** (Creative Sprouts) — either add a receipt through the app
  (photo + amount/date/vendor + category), or just drop the photo straight
  into that category's folder in Drive — the app matches the folder name to
  the category and creates the expense automatically. Drive-dropped
  receipts land in a "needs review" state (categorized, but no amount yet)
  until someone opens them and fills that in. Categories can be renamed,
  recolored, or deleted at any time — the matching Drive folder is kept in
  sync. Every account with a login (owner + employees) sees and edits the
  same shared set of records.

It's built for one operator (you) rather than a public multi-tenant SaaS —
login is a single owner account you create yourself.

## Stack

Next.js (App Router) · TypeScript · Tailwind · Postgres + Prisma ·
NextAuth (credentials login) · Gmail API (googleapis) · Google Drive API
(receipt photo storage) · Meta Marketing API (Graph API) · Apollo.io API
(lead search) · Vercel Cron for the send scheduler.

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

To give an employee access (e.g. so they can log Expenses), run the same
command with their email — every logged-in account sees the same shared
Expenses data.

### 4. Google Cloud project (for Gmail sending and/or Drive receipt storage)

One Google Cloud project + OAuth client covers both the cold-email Gmail
connection and the Expenses Drive connection — you only need to do this
once, then connect whichever piece(s) you actually use from **Settings**.

1. Go to [console.cloud.google.com](https://console.cloud.google.com),
   create a project.
2. **APIs & Services → Library** — enable the **Gmail API** (for cold
   email) and the **Google Drive API** (for Expenses receipt photos).
   Skip whichever one you don't need.
3. **APIs & Services → OAuth consent screen** — set it up (External is
   fine; while it's in "Testing" mode, add your own Gmail address — and
   any employee's, if they'll connect their own Drive — as test users).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   — type **Web application**. Add an authorized redirect URI:
   - Local dev: `http://localhost:3000/api/connect/google/callback`
   - Production: `https://your-domain.com/api/connect/google/callback`
5. Copy the client ID/secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
6. In the app, go to **Settings** and click **Connect Gmail** and/or
   **Connect Google Drive**, whichever you need, and approve access.
   - Gmail only requests the `gmail.send` scope — the app can send on your
     behalf but can't read your inbox.
   - Drive only requests the `drive.file` scope — the app can only see
     files it creates itself (the receipts it uploads into a "Creative
     Sprouts Receipts" folder), not the rest of that Drive account.

**Known limitation (Gmail):** because we intentionally only request
`gmail.send` (not inbox read access), the app can't automatically detect
when a lead replies. Use the **"Mark replied"** button on a campaign's
enrollment list to stop follow-ups for that lead once they respond. If
you'd rather have automatic reply detection, that needs the
`gmail.readonly` (or `gmail.modify`) scope added — a reasonable next step,
but a bigger trust footprint on your inbox.

Whichever Google account you connect Drive with owns the receipts folder —
that's usually the business owner's account, connected once; employees
then just log expenses through the app itself (see step 3) without needing
their own Drive connection.

**How the Drive folder sync works:** once connected, the app creates a
"Creative Sprouts Receipts" folder with one subfolder per expense category
(e.g. `Creative Sprouts Receipts/Travel`, `.../Equipment & Gear`). Anyone
with access to that Drive folder — including employees you've just shared
it with in Drive itself, whether or not they have a login to this app — can
drop a receipt photo straight into the matching subfolder. The app checks
for new photos every time someone opens the **Expenses** page (there's also
a **Check Drive now** button for an instant check), matches the subfolder
name to the category, and creates an expense — flagged **"needs review"**
until someone opens it in the app and fills in the amount. Renaming a
category in the app renames its Drive subfolder to match; deleting a
category leaves the subfolder alone (nothing dropped in it afterward gets
picked up, since nothing points at it as a category anymore).

### 5. Apollo.io (optional, for finding leads instead of CSV upload)

By default there's no built-in lead sourcing — you bring a CSV. If you'd
rather search for prospects by job title/location/keyword from inside the
app:

1. Sign up at [apollo.io](https://apollo.io). Search-and-reveal via the API
   needs a plan with API access (check Apollo's current pricing — their
   free tier historically doesn't include it).
2. **Settings (in Apollo) → Integrations → API** — generate an API key.
3. In the app, go to **Settings** and paste it into **Lead search
   (Apollo.io)**.
4. Use **Leads → Find leads on Apollo** to search, then select the people
   you want and import them into a list.

Apollo bills its own credits per revealed email address (separate from
anything in this app) — the import flow only reveals emails for contacts
you explicitly select, and shows how many that will use before you confirm.

### 6. Meta ad account (optional, for Meta Ads)

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

### 7. Run it

```bash
npm run dev
```

### 8. Sending on a schedule

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
src/lib/apollo.ts            Apollo.io people search + email reveal
src/lib/campaign-engine.ts   Core scheduler: picks due sends, sends, reschedules
src/lib/schedule.ts          Timezone-aware send-window math
src/lib/template.ts          {{token}} personalization
src/lib/csv.ts                CSV → lead parsing/column mapping
src/lib/drive.ts               Google Drive upload/fetch/delete + category-folder sync for receipts
src/app/api/receipts/*        Auth-gated proxy that serves receipt photos out of Drive
src/lib/actions/*            Server actions (forms call these directly)
src/app/(app)/*              Authenticated pages (dashboard, leads, campaigns, ads, expenses, settings)
src/app/api/cron/*           Scheduler endpoint
src/app/api/connect/google/* Gmail OAuth connect flow
src/app/api/track/open/*     Open-tracking pixel
```

## Compliance note

Cold email and ad platforms have real rules (CAN-SPAM/CASL, Meta ad
policies). This tool doesn't file unsubscribe requests or add a
CASL-compliant footer/unsubscribe link for you — add one to your templates
and honor opt-outs (the `UNSUBSCRIBED` lead status is there for you to use).
