"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { searchProspects, importProspects } from "@/lib/actions/leads";
import type { ApolloProspect } from "@/lib/apollo";
import { Card, Button, Badge } from "@/lib/ui";

export default function FindLeadsForm({
  leadLists,
}: {
  leadLists: { id: string; name: string }[];
}) {
  const [jobTitles, setJobTitles] = useState("Wedding Photographer, Videographer");
  const [locations, setLocations] = useState("Toronto, ON");
  const [keywords, setKeywords] = useState("");

  const [prospects, setProspects] = useState<ApolloProspect[]>([]);
  const [totalEntries, setTotalEntries] = useState(0);
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

  const suggestedListName = useMemo(() => {
    const parts = [jobTitles.split(",")[0]?.trim(), locations.split(",")[0]?.trim()].filter(
      Boolean
    );
    return parts.length ? parts.join(" - ") : "Apollo search";
  }, [jobTitles, locations]);

  function runSearch() {
    setSearchError(null);
    setImportResult(null);
    setImportError(null);
    startSearch(async () => {
      const result = await searchProspects({
        jobTitles: splitList(jobTitles),
        locations: splitList(locations),
        keywords: keywords.trim() || undefined,
        perPage: 25,
      });
      setHasSearched(true);
      if (!result.ok) {
        setSearchError(result.error);
        setProspects([]);
        setTotalEntries(0);
        return;
      }
      setProspects(result.prospects);
      setTotalEntries(result.totalEntries);
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
    setSelected((prev) =>
      prev.size === prospects.length ? new Set() : new Set(prospects.map((p) => p.apolloId))
    );
  }

  function runImport() {
    setImportError(null);
    setImportResult(null);
    const chosen = prospects.filter((p) => selected.has(p.apolloId));
    startImport(async () => {
      const result = await importProspects({
        listName: newListName.trim() || suggestedListName,
        existingListId: listChoice === "new" ? undefined : listChoice,
        prospects: chosen.map((p) => ({
          apolloId: p.apolloId,
          firstName: p.firstName,
          lastName: p.lastName,
          title: p.title,
          company: p.company,
          companyWebsite: p.companyWebsite,
          location: p.location,
          linkedinUrl: p.linkedinUrl,
        })),
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
              Job titles (comma-separated)
            </label>
            <input
              value={jobTitles}
              onChange={(e) => setJobTitles(e.target.value)}
              placeholder="Wedding Photographer, Creative Director"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400">
              Locations (comma-separated)
            </label>
            <input
              value={locations}
              onChange={(e) => setLocations(e.target.value)}
              placeholder="Toronto, ON"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-neutral-400">
              Keywords (optional)
            </label>
            <input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="e.g. real estate, film production"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button type="button" onClick={runSearch} disabled={isSearching}>
            {isSearching ? "Searching..." : "Search Apollo"}
          </Button>
          {hasSearched && !searchError && (
            <span className="text-xs text-neutral-500">
              {totalEntries.toLocaleString()} total matches &middot; showing {prospects.length}
            </span>
          )}
        </div>
        {searchError && <p className="mt-3 text-sm text-red-400">{searchError}</p>}
      </Card>

      {prospects.length > 0 && (
        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <label className="flex items-center gap-2 text-xs text-neutral-400">
              <input
                type="checkbox"
                checked={selected.size === prospects.length}
                onChange={toggleAll}
                className="rounded border-neutral-700 bg-neutral-950"
              />
              Select all
            </label>
            <span className="text-xs text-neutral-500">{selectedCount} selected</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-3" />
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {prospects.map((p) => (
                  <tr key={p.apolloId}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(p.apolloId)}
                        onChange={() => toggle(p.apolloId)}
                        className="rounded border-neutral-700 bg-neutral-950"
                      />
                    </td>
                    <td className="px-4 py-3 text-neutral-200">
                      {[p.firstName, p.lastName].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-neutral-400">{p.title ?? "—"}</td>
                    <td className="px-4 py-3 text-neutral-400">{p.company ?? "—"}</td>
                    <td className="px-4 py-3 text-neutral-400">{p.location ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone="amber">not revealed yet</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-neutral-800 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-neutral-400">
                  Add to
                </label>
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
              Revealing an email costs 1 Apollo credit each &mdash; only for the{" "}
              {selectedCount || 0} you select, not the full {prospects.length} shown. Some
              contacts have no available email and won&apos;t use a credit or get imported.
            </p>

            <div className="mt-3 flex items-center gap-3">
              <Button
                type="button"
                onClick={runImport}
                disabled={selectedCount === 0 || isImporting}
              >
                {isImporting
                  ? "Revealing & importing..."
                  : `Reveal & import ${selectedCount || ""} selected`.trim()}
              </Button>
              {importError && <p className="text-sm text-red-400">{importError}</p>}
            </div>

            {importResult && (
              <div className="mt-3 rounded-xl border border-emerald-900 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-300">
                Imported {importResult.imported} lead{importResult.imported === 1 ? "" : "s"}
                {importResult.skipped > 0
                  ? ` (${importResult.skipped} had no available email and were skipped)`
                  : ""}
                . <Link href={`/leads/${importResult.listId}`} className="underline">
                  View list
                </Link>
              </div>
            )}
          </div>
        </Card>
      )}

      {hasSearched && !searchError && prospects.length === 0 && (
        <Card>
          <p className="text-sm text-neutral-500">
            No matches for that search. Try broader job titles or locations.
          </p>
        </Card>
      )}
    </div>
  );
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}
