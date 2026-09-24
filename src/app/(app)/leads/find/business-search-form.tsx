"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { searchBusinesses, importBusinesses } from "@/lib/actions/leads";
import type { PlaceResult } from "@/lib/google-places";
import { Card, Button, Badge } from "@/lib/ui";

export default function BusinessSearchForm({
  leadLists,
  hunterConnected,
}: {
  leadLists: { id: string; name: string }[];
  hunterConnected: boolean;
}) {
  const [category, setCategory] = useState("wedding videographer");
  const [location, setLocation] = useState("Toronto, ON");

  const [businesses, setBusinesses] = useState<PlaceResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [listChoice, setListChoice] = useState("new");
  const [newListName, setNewListName] = useState("");
  const [importResult, setImportResult] = useState<
    { imported: number; skipped: number; listId: string } | null
  >(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [isSearching, startSearch] = useTransition();
  const [isImporting, startImport] = useTransition();

  const selectedCount = selected.size;
  const suggestedListName = category && location ? `${category} - ${location}` : "Business search";

  function runSearch() {
    setSearchError(null);
    setImportResult(null);
    setImportError(null);
    startSearch(async () => {
      const result = await searchBusinesses({ category, location });
      setHasSearched(true);
      if (!result.ok) {
        setSearchError(result.error);
        setBusinesses([]);
        return;
      }
      setBusinesses(result.businesses);
      setSelected(new Set());
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const withWebsite = businesses.filter((b) => b.website);
    setSelected((prev) =>
      prev.size === withWebsite.length ? new Set() : new Set(withWebsite.map((b) => b.placeId))
    );
  }

  function runImport() {
    setImportError(null);
    setImportResult(null);
    const chosen = businesses.filter((b) => selected.has(b.placeId));
    startImport(async () => {
      const result = await importBusinesses({
        listName: newListName.trim() || suggestedListName,
        existingListId: listChoice === "new" ? undefined : listChoice,
        businesses: chosen,
      });
      if (!result.ok) {
        setImportError(result.error);
        return;
      }
      setImportResult(result);
      setSelected(new Set());
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-neutral-400">
              What kind of business
            </label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="wedding videographer"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400">Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Toronto, ON"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button type="button" onClick={runSearch} disabled={isSearching}>
            {isSearching ? "Searching..." : "Search Google Places"}
          </Button>
          {hasSearched && !searchError && (
            <span className="text-xs text-neutral-500">{businesses.length} businesses found</span>
          )}
        </div>
        {searchError && <p className="mt-3 text-sm text-red-400">{searchError}</p>}
      </Card>

      {businesses.length > 0 && (
        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <label className="flex items-center gap-2 text-xs text-neutral-400">
              <input
                type="checkbox"
                checked={selected.size > 0 && selected.size === businesses.filter((b) => b.website).length}
                onChange={toggleAll}
                className="rounded border-neutral-700 bg-neutral-950"
              />
              Select all with a website
            </label>
            <span className="text-xs text-neutral-500">{selectedCount} selected</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-3" />
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Address</th>
                  <th className="px-4 py-3">Website</th>
                  <th className="px-4 py-3">Phone</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {businesses.map((b) => (
                  <tr key={b.placeId}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(b.placeId)}
                        disabled={!b.website}
                        onChange={() => toggle(b.placeId)}
                        className="rounded border-neutral-700 bg-neutral-950 disabled:opacity-30"
                      />
                    </td>
                    <td className="px-4 py-3 text-neutral-200">{b.name}</td>
                    <td className="px-4 py-3 text-neutral-400">{b.address ?? "—"}</td>
                    <td className="px-4 py-3 text-neutral-400">
                      {b.website ? (
                        b.website.replace(/^https?:\/\//i, "").replace(/\/$/, "")
                      ) : (
                        <Badge tone="amber">no website</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-400">{b.phone ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-neutral-800 p-4">
            {!hunterConnected ? (
              <p className="text-sm text-amber-400">
                Connect Hunter.io in{" "}
                <Link href="/settings" className="underline">
                  Settings
                </Link>{" "}
                to look up email addresses and import these businesses.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-neutral-400">Add to</label>
                    <select
                      value={listChoice}
                      onChange={(e) => setListChoice(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
                    >
                      <option value="new">New list</option>
                      {leadLists.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {listChoice === "new" && (
                    <div>
                      <label className="block text-xs font-medium text-neutral-400">
                        List name
                      </label>
                      <input
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        placeholder={suggestedListName}
                        className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
                      />
                    </div>
                  )}
                </div>

                <p className="mt-3 text-xs text-neutral-500">
                  Each selected business uses 1 Hunter.io search (not per email found) to look
                  up who&apos;s reachable at their website. Businesses with no findable email
                  are skipped and won&apos;t use a search.
                </p>

                <div className="mt-3 flex items-center gap-3">
                  <Button
                    type="button"
                    onClick={runImport}
                    disabled={selectedCount === 0 || isImporting}
                  >
                    {isImporting
                      ? "Looking up & importing..."
                      : `Look up & import ${selectedCount || ""} selected`.trim()}
                  </Button>
                  {importError && <p className="text-sm text-red-400">{importError}</p>}
                </div>

                {importResult && (
                  <div className="mt-3 rounded-xl border border-emerald-900 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-300">
                    Imported {importResult.imported} lead{importResult.imported === 1 ? "" : "s"}
                    {importResult.skipped > 0
                      ? ` (${importResult.skipped} had no findable email and were skipped)`
                      : ""}
                    . <Link href={`/leads/${importResult.listId}`} className="underline">
                      View list
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </Card>
      )}

      {hasSearched && !searchError && businesses.length === 0 && (
        <Card>
          <p className="text-sm text-neutral-500">
            No matches. Try a broader category or a wider location.
          </p>
        </Card>
      )}
    </div>
  );
}
