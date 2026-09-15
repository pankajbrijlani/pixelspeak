import { readFile } from "node:fs/promises";

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

/**
 * Optional dialogue transcription used to boost scores for segments with
 * real speech content and to burn in captions. Skipped entirely (returns
 * null) when no OPENAI_API_KEY is configured, so the rest of the pipeline
 * degrades gracefully to audio/visual heuristics alone.
 */
export async function transcribeAudio(wavPath: string): Promise<TranscriptSegment[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const audioBuffer = await readFile(wavPath);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audioBuffer)]), "audio.wav");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    console.error("[montage] transcription failed", res.status, await res.text().catch(() => ""));
    return null;
  }

  const data = (await res.json()) as {
    segments?: { start: number; end: number; text: string }[];
  };

  return (data.segments ?? []).map((s) => ({
    start: s.start,
    end: s.end,
    text: s.text.trim(),
  }));
}

const FILLER_WORDS = new Set(["um", "uh", "like", "yeah", "okay", "so", "you know"]);

/** Rough "is this actually saying something" score: word count minus filler. */
export function speechDensityScore(text: string): number {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 0;
  const meaningful = words.filter((w) => !FILLER_WORDS.has(w));
  return meaningful.length;
}
