"use client";

import { useState } from "react";
import FindLeadsForm from "./find-leads-form";
import BusinessSearchForm from "./business-search-form";

type Tab = "people" | "businesses";

export default function FindLeadsTabs({
  leadLists,
  apolloConnected,
  googlePlacesConnected,
  hunterConnected,
}: {
  leadLists: { id: string; name: string }[];
  apolloConnected: boolean;
  googlePlacesConnected: boolean;
  hunterConnected: boolean;
}) {
  const [tab, setTab] = useState<Tab>(apolloConnected ? "people" : "businesses");

  return (
    <div>
      <div className="mb-6 inline-flex rounded-lg border border-neutral-800 bg-neutral-900 p-1">
        <button
          type="button"
          onClick={() => setTab("people")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            tab === "people" ? "bg-violet-600 text-white" : "text-neutral-400 hover:text-white"
          }`}
        >
          People (Apollo)
        </button>
        <button
          type="button"
          onClick={() => setTab("businesses")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            tab === "businesses" ? "bg-violet-600 text-white" : "text-neutral-400 hover:text-white"
          }`}
        >
          Businesses (Google + Hunter)
        </button>
      </div>

      {tab === "people" ? (
        apolloConnected ? (
          <FindLeadsForm leadLists={leadLists} />
        ) : (
          <NotConnected
            text="Connect Apollo in Settings to search for people by job title and location."
          />
        )
      ) : googlePlacesConnected ? (
        <BusinessSearchForm leadLists={leadLists} hunterConnected={hunterConnected} />
      ) : (
        <NotConnected text="Connect Google Places in Settings to search for businesses by category and location." />
      )}
    </div>
  );
}

function NotConnected({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-amber-900 bg-amber-950/30 p-6 text-sm text-amber-300">
      {text}
    </div>
  );
}
