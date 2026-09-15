"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircleIcon,
  DownloadIcon,
  ErrorCircleIcon,
  FilmIcon,
  ImageIcon,
  SpinnerIcon,
  UploadCloudIcon,
} from "../icons";

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
  const [dragActive, setDragActive] = useState(false);
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
    const active =
      status === "ANALYZING" ||
      status === "RENDERING" ||
      assets.some((a) => a.status !== "READY" && a.status !== "FAILED");
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
    setDragActive(false);
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
  const uploadPct = uploadProgress ? Math.round((uploadProgress.done / uploadProgress.total) * 100) : 0;

  return (
    <div className="space-y-8">
      <Step number={1} title="Add your footage" done={assets.length > 0 && !uploading}>
        <div
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          className={`rounded-2xl border-2 border-dashed p-10 text-center transition ${
            dragActive ? "border-violet-500 bg-violet-500/10" : "border-neutral-700 bg-neutral-900/40"
          }`}
        >
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-800 text-neutral-400">
            <UploadCloudIcon />
          </div>
          <p className="text-sm font-medium text-neutral-200">Drag & drop a folder of videos and photos</p>
          <p className="mt-1 text-xs text-neutral-500">or</p>
          <div className="mt-3 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="rounded-lg border border-neutral-700 px-3.5 py-2 text-sm text-neutral-200 transition hover:bg-neutral-800"
            >
              Choose a folder
            </button>
            <button
              type="button"
              onClick={() => filesInputRef.current?.click()}
              className="rounded-lg border border-neutral-700 px-3.5 py-2 text-sm text-neutral-200 transition hover:bg-neutral-800"
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
            <div className="mx-auto mt-5 max-w-xs">
              <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
                <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${uploadPct}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-violet-400">
                Uploading {uploadProgress.done}/{uploadProgress.total}…
              </p>
            </div>
          )}
        </div>

        {assets.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-neutral-500">
              {assets.length} file{assets.length === 1 ? "" : "s"} &middot; {readyCount} analyzed
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {assets.map((a) => (
                <div key={a.id} className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-800 bg-black">
                  {a.type === "PHOTO" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/montage/media/${a.id}`} alt={a.originalName} className="h-full w-full object-cover" />
                  ) : a.status === "READY" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/montage/thumbnail/${a.id}`} alt={a.originalName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-neutral-900 text-neutral-600">
                      <FilmIcon className={`h-6 w-6 ${a.status === "ANALYZING" ? "animate-pulse" : ""}`} />
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1">
                    <span className="flex items-center gap-1 text-white/80">
                      {a.type === "VIDEO" ? <FilmIcon className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                    </span>
                    <AssetStatusDot status={a.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Step>

      <Step number={2} title="Generate your montage" done={status === "DONE"}>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={assets.length === 0 || busy || uploading || generating}
            onClick={handleGenerate}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <SpinnerIcon className="h-4 w-4" />}
            {busy ? (status === "ANALYZING" ? "Finding the good moments…" : "Rendering final cut…") : "Generate montage"}
          </button>
          {!busy && assets.length === 0 && <span className="text-xs text-neutral-500">Add footage first</span>}
        </div>

        {busy && (
          <div className="mt-3 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-neutral-800">
            <div className="h-full w-1/3 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-violet-500" />
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
            <ErrorCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </Step>

      {hasOutput && status === "DONE" && (
        <Step number={3} title="Your montage" done>
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 sm:items-start sm:flex-row">
            <video
              controls
              className="max-h-[60vh] w-auto max-w-full rounded-xl border border-neutral-800 shadow-xl"
              src={`/api/montage/output/${projectId}`}
            />
            <div className="flex flex-col gap-2 sm:pt-2">
              <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-400">
                <CheckCircleIcon className="h-4 w-4" /> Ready
              </p>
              <a
                href={`/api/montage/output/${projectId}`}
                download
                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500"
              >
                <DownloadIcon />
                Download MP4
              </a>
            </div>
          </div>
        </Step>
      )}
    </div>
  );
}

function Step({
  number,
  title,
  done,
  children,
}: {
  number: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            done ? "bg-emerald-500/20 text-emerald-400" : "bg-neutral-800 text-neutral-400"
          }`}
        >
          {done ? <CheckCircleIcon className="h-4 w-4" /> : number}
        </span>
        <h2 className="text-sm font-medium text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function AssetStatusDot({ status }: { status: AssetStatus }) {
  const color =
    status === "READY"
      ? "bg-emerald-400"
      : status === "FAILED"
        ? "bg-red-400"
        : status === "ANALYZING"
          ? "bg-violet-400 animate-pulse"
          : "bg-neutral-500";
  return <span className={`h-1.5 w-1.5 rounded-full ${color}`} />;
}
