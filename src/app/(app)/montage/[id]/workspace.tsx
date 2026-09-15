"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/lib/ui";

type AssetStatus = "PENDING" | "ANALYZING" | "READY" | "FAILED";
type ProjectStatus = "DRAFT" | "ANALYZING" | "RENDERING" | "DONE" | "FAILED";

interface AssetSummary {
  id: string;
  originalName: string;
  type: "VIDEO" | "PHOTO";
  status: AssetStatus;
}

interface StatusResponse {
  status: ProjectStatus;
  errorMessage: string | null;
  hasOutput: boolean;
  assets: AssetSummary[];
  segmentCount: number;
}

const POLL_MS = 3000;
const ACCEPTED_EXT = /\.(mp4|mov|m4v|webm|avi|mkv|jpg|jpeg|png|webp|heic)$/i;

export function MontageWorkspace({
  projectId,
  initialAssets,
  initialStatus,
  initialHasOutput,
}: {
  projectId: string;
  initialAssets: AssetSummary[];
  initialStatus: ProjectStatus;
  initialHasOutput: boolean;
}) {
  const [assets, setAssets] = useState<AssetSummary[]>(initialAssets);
  const [status, setStatus] = useState<ProjectStatus>(initialStatus);
  const [hasOutput, setHasOutput] = useState(initialHasOutput);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);

  const refreshStatus = useCallback(async () => {
    const res = await fetch(`/api/montage/projects/${projectId}/status`, { cache: "no-store" });
    if (!res.ok) return;
    const data: StatusResponse = await res.json();
    setStatus(data.status);
    setErrorMessage(data.errorMessage);
    setHasOutput(data.hasOutput);
    setAssets(data.assets);
  }, [projectId]);

  useEffect(() => {
    const active = status === "ANALYZING" || status === "RENDERING" || assets.some((a) => a.status !== "READY" && a.status !== "FAILED");
    if (!active) return;
    const interval = setInterval(refreshStatus, POLL_MS);
    return () => clearInterval(interval);
  }, [status, assets, refreshStatus]);

  async function uploadFiles(files: File[]) {
    const valid = files.filter((f) => ACCEPTED_EXT.test(f.name));
    if (valid.length === 0) return;

    setUploading(true);
    setUploadProgress({ done: 0, total: valid.length });

    const BATCH = 5;
    for (let i = 0; i < valid.length; i += BATCH) {
      const batch = valid.slice(i, i + BATCH);
      const form = new FormData();
      batch.forEach((f) => form.append("files", f, f.name));

      const res = await fetch(`/api/montage/projects/${projectId}/assets`, { method: "POST", body: form });
      if (res.ok) {
        const data: { created: { id: string; originalName: string }[] } = await res.json();
        setAssets((prev) => [
          ...prev,
          ...data.created.map((c) => ({
            id: c.id,
            originalName: c.originalName,
            type: (/\.(jpg|jpeg|png|webp|heic)$/i.test(c.originalName) ? "PHOTO" : "VIDEO") as "PHOTO" | "VIDEO",
            status: "PENDING" as AssetStatus,
          })),
        ]);
      }
      setUploadProgress({ done: Math.min(i + BATCH, valid.length), total: valid.length });
    }

    setUploading(false);
    setUploadProgress(null);
  }

  async function collectFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
    const items = Array.from(dataTransfer.items);
    const files: File[] = [];

    async function walk(entry: FileSystemEntry): Promise<void> {
      if (entry.isFile) {
        const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
        files.push(file);
      } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        await Promise.all(entries.map(walk));
      }
    }

    const entries = items.map((item) => item.webkitGetAsEntry()).filter((e): e is FileSystemEntry => e !== null);
    if (entries.length > 0) {
      await Promise.all(entries.map(walk));
    } else {
      files.push(...Array.from(dataTransfer.files));
    }
    return files;
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    collectFilesFromDataTransfer(e.dataTransfer).then(uploadFiles);
  }

  async function handleGenerate() {
    setGenerating(true);
    setErrorMessage(null);
    const res = await fetch(`/api/montage/projects/${projectId}/generate`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Failed to start" }));
      setErrorMessage(data.error ?? "Failed to start");
      setGenerating(false);
      return;
    }
    setStatus("ANALYZING");
    setGenerating(false);
    refreshStatus();
  }

  const busy = status === "ANALYZING" || status === "RENDERING";
  const readyCount = assets.filter((a) => a.status === "READY").length;

  return (
    <div className="space-y-6">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="rounded-2xl border-2 border-dashed border-neutral-700 bg-neutral-900/50 p-8 text-center"
      >
        <p className="text-sm text-neutral-300">Drag & drop a folder of videos and photos here</p>
        <p className="mt-1 text-xs text-neutral-500">or</p>
        <div className="mt-3 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            Choose a folder
          </button>
          <button
            type="button"
            onClick={() => filesInputRef.current?.click()}
            className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            Choose files
          </button>
        </div>
        <input
          ref={folderInputRef}
          type="file"
          multiple
          // @ts-expect-error non-standard attribute, Chromium/Edge only
          webkitdirectory=""
          className="hidden"
          onChange={(e) => e.target.files && uploadFiles(Array.from(e.target.files))}
        />
        <input
          ref={filesInputRef}
          type="file"
          multiple
          accept="video/*,image/*"
          className="hidden"
          onChange={(e) => e.target.files && uploadFiles(Array.from(e.target.files))}
        />
        {uploadProgress && (
          <p className="mt-3 text-xs text-violet-400">
            Uploading {uploadProgress.done}/{uploadProgress.total}…
          </p>
        )}
      </div>

      {assets.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-white">
            Footage ({readyCount}/{assets.length} analyzed)
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {assets.map((a) => (
              <div key={a.id} className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
                <div className="flex h-20 items-center justify-center bg-black text-2xl">
                  {a.type === "PHOTO" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/montage/media/${a.id}`} alt={a.originalName} className="h-full w-full object-cover" />
                  ) : (
                    <span>🎬</span>
                  )}
                </div>
                <div className="p-1.5">
                  <p className="truncate text-[11px] text-neutral-300">{a.originalName}</p>
                  <AssetStatusBadge status={a.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={assets.length === 0 || busy || uploading || generating}
          onClick={handleGenerate}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
        >
          {busy ? "Working…" : "Generate montage"}
        </button>
        {busy && (
          <span className="text-xs text-neutral-400">
            {status === "ANALYZING" ? "Finding the good moments…" : "Rendering final cut…"}
          </span>
        )}
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{errorMessage}</div>
      )}

      {hasOutput && status === "DONE" && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-white">Your montage</h2>
          <video controls className="max-h-[70vh] rounded-xl border border-neutral-800" src={`/api/montage/output/${projectId}`} />
          <a
            href={`/api/montage/output/${projectId}`}
            download
            className="inline-block text-sm text-violet-400 hover:underline"
          >
            Download MP4
          </a>
        </div>
      )}
    </div>
  );
}

function AssetStatusBadge({ status }: { status: AssetStatus }) {
  if (status === "READY") return <Badge tone="green">ready</Badge>;
  if (status === "FAILED") return <Badge tone="red">failed</Badge>;
  if (status === "ANALYZING") return <Badge tone="violet">analyzing</Badge>;
  return <Badge tone="neutral">pending</Badge>;
}
