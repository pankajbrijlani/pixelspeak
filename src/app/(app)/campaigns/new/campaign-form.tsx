"use client";

import { useState } from "react";
import { createCampaign } from "@/lib/actions/campaigns";
import { Card, Button } from "@/lib/ui";
import { AVAILABLE_TOKENS } from "@/lib/template";

type Step = { subject: string; bodyHtml: string; delayDays: number };

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CampaignForm({
  leadLists,
  emailAccounts,
  defaultListId,
}: {
  leadLists: { id: string; name: string }[];
  emailAccounts: { id: string; emailAddress: string }[];
  defaultListId?: string;
}) {
  const [steps, setSteps] = useState<Step[]>([
    { subject: "Quick question about {{company}}", bodyHtml: "Hi {{firstName}},\n\n", delayDays: 0 },
  ]);
  const [sendDays, setSendDays] = useState<number[]>([1, 2, 3, 4, 5]);

  function updateStep(index: number, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addStep() {
    setSteps((prev) => [
      ...prev,
      { subject: "", bodyHtml: `Hi {{firstName}},\n\nJust bumping this up.\n\n`, delayDays: 3 },
    ]);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleDay(day: number) {
    setSendDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  const stepsJson = JSON.stringify(
    steps.map((s, i) => ({
      order: i + 1,
      delayDays: i === 0 ? 0 : s.delayDays,
      subject: s.subject,
      bodyHtml: s.bodyHtml,
    }))
  );

  return (
    <form action={createCampaign} className="space-y-6">
      <input type="hidden" name="stepsJson" value={stepsJson} />
      <input type="hidden" name="sendDays" value={sendDays.join(",")} />

      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-neutral-400">
              Campaign name
            </label>
            <input
              name="name"
              required
              placeholder="e.g. Toronto wedding photographers - Sept"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400">
              Send from
            </label>
            <select
              name="emailAccountId"
              required
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            >
              {emailAccounts.length === 0 && <option value="">No mailbox connected</option>}
              {emailAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.emailAddress}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400">
              Lead list
            </label>
            <select
              name="leadListId"
              required
              defaultValue={defaultListId}
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            >
              {leadLists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400">
              Timezone
            </label>
            <input
              name="timezone"
              defaultValue="America/Toronto"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-neutral-400">
              Send window (hour, local time)
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                name="sendWindowStart"
                min={0}
                max={23}
                defaultValue={9}
                className="w-20 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              />
              <span className="text-neutral-500">to</span>
              <input
                type="number"
                name="sendWindowEnd"
                min={1}
                max={24}
                defaultValue={17}
                className="w-20 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400">
              Send days
            </label>
            <div className="mt-1 flex flex-wrap gap-1">
              {DAY_LABELS.map((label, day) => (
                <button
                  type="button"
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    sendDays.includes(day)
                      ? "bg-violet-600 text-white"
                      : "border border-neutral-700 text-neutral-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Sequence</h2>
          <p className="text-xs text-neutral-500">
            Tokens: {AVAILABLE_TOKENS.join(" ")}
          </p>
        </div>

        {steps.map((step, i) => (
          <Card key={i}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-white">
                {i === 0 ? "Step 1 · Initial email" : `Step ${i + 1} · Follow-up`}
              </h3>
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => removeStep(i)}
                  className="text-xs text-neutral-500 hover:text-red-400"
                >
                  Remove
                </button>
              )}
            </div>

            {i > 0 && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-neutral-400">
                  Send this many days after the previous step
                </label>
                <input
                  type="number"
                  min={1}
                  value={step.delayDays}
                  onChange={(e) => updateStep(i, { delayDays: Number(e.target.value) })}
                  className="mt-1 w-24 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
                />
              </div>
            )}

            <div className="mt-3">
              <label className="block text-xs font-medium text-neutral-400">Subject</label>
              <input
                value={step.subject}
                onChange={(e) => updateStep(i, { subject: e.target.value })}
                required
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-neutral-400">Body</label>
              <textarea
                value={step.bodyHtml}
                onChange={(e) => updateStep(i, { bodyHtml: e.target.value })}
                required
                rows={7}
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>
          </Card>
        ))}

        <Button type="button" variant="secondary" onClick={addStep}>
          + Add follow-up step
        </Button>
      </div>

      <div className="flex justify-end">
        <Button type="submit">Save campaign as draft</Button>
      </div>
    </form>
  );
}
