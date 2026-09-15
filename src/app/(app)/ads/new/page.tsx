import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { PageHeader, Card, Button } from "@/lib/ui";
import { createAdCampaign } from "@/lib/actions/ads";

export default async function NewAdCampaignPage() {
  const userId = await requireUserId();
  const adAccounts = await prisma.adAccount.findMany({ where: { userId } });
  if (adAccounts.length === 0) redirect("/ads");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="New ad campaign"
        description="This creates a draft. Nothing launches to Meta — or spends any money — until you press Launch on the next screen."
      />

      <Card>
        <form action={createAdCampaign} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-neutral-400">
                Ad account
              </label>
              <select
                name="adAccountId"
                required
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              >
                {adAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.businessName ?? a.adAccountId}
                    {!a.accessToken ? " (no token — draft only)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-neutral-400">
                Campaign name
              </label>
              <input
                name="name"
                required
                placeholder="PixelSpeak - Toronto photo/video edits"
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-400">
                Objective
              </label>
              <select
                name="objective"
                defaultValue="LEAD_GENERATION"
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              >
                <option value="LEAD_GENERATION">Lead generation</option>
                <option value="TRAFFIC">Traffic</option>
                <option value="ENGAGEMENT">Engagement</option>
                <option value="AWARENESS">Awareness</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-400">
                Daily budget (USD)
              </label>
              <input
                type="number"
                name="dailyBudget"
                min={1}
                step="0.01"
                defaultValue={20}
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-neutral-400">
                Headline
              </label>
              <input
                name="headline"
                placeholder="Video & photo editing that gets clients booked"
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-neutral-400">
                Primary text
              </label>
              <textarea
                name="primaryText"
                rows={3}
                placeholder="20 years in VFX and photo editing. Fast turnaround, pro results."
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-neutral-400">
                Image URL
              </label>
              <input
                name="imageUrl"
                placeholder="https://pixelsspeak.com/ad-image.jpg"
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              />
              <p className="mt-1 text-xs text-neutral-500">
                Must be a public image URL Meta can fetch.
              </p>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-neutral-400">
                Destination URL
              </label>
              <input
                name="destinationUrl"
                placeholder="https://pixelsspeak.com"
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-400">
                Target countries (comma-separated)
              </label>
              <input
                name="targetLocations"
                defaultValue="CA"
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-400">
                Interests (comma-separated, optional)
              </label>
              <input
                name="targetInterests"
                placeholder="Photography, Videography"
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-400">
                Min age
              </label>
              <input
                type="number"
                name="targetAgeMin"
                min={13}
                max={65}
                defaultValue={21}
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-400">
                Max age
              </label>
              <input
                type="number"
                name="targetAgeMax"
                min={13}
                max={65}
                defaultValue={65}
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit">Save as draft</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
