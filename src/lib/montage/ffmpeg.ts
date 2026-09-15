import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

const execFileAsync = promisify(execFile);

const FFMPEG_BIN = ffmpegPath ?? "ffmpeg";
const FFPROBE_BIN = ffprobeStatic.path ?? "ffprobe";

const MAX_BUFFER = 1024 * 1024 * 64; // 64MB of stderr/stdout is plenty for hour-long clips

export interface ProbeResult {
  durationSec: number;
  width?: number;
  height?: number;
}

export async function probe(filePath: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync(
    FFPROBE_BIN,
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ],
    { maxBuffer: MAX_BUFFER },
  );
  const data = JSON.parse(stdout);
  const videoStream = (data.streams ?? []).find((s: { codec_type?: string }) => s.codec_type === "video");
  const durationSec = Number(data.format?.duration ?? videoStream?.duration ?? 0);
  return {
    durationSec: Number.isFinite(durationSec) ? durationSec : 0,
    width: videoStream?.width,
    height: videoStream?.height,
  };
}

/** Timestamps (in seconds) of detected shot/scene changes, via ffmpeg's scene-change filter. */
export async function detectScenes(filePath: string, threshold = 0.35): Promise<number[]> {
  const { stderr } = await runFfmpeg([
    "-i",
    filePath,
    "-filter:v",
    `select='gt(scene,${threshold})',showinfo`,
    "-f",
    "null",
    "-",
  ]);
  const timestamps: number[] = [];
  const re = /pts_time:([0-9.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr))) {
    timestamps.push(Number(m[1]));
  }
  return timestamps;
}

export interface SilenceRange {
  start: number;
  end: number;
}

/** Ranges of near-silence, via ffmpeg's silencedetect filter — the complement is "energetic" audio. */
export async function detectSilence(
  filePath: string,
  noiseDb = -30,
  minDurationSec = 0.4,
): Promise<SilenceRange[]> {
  const { stderr } = await runFfmpeg([
    "-i",
    filePath,
    "-af",
    `silencedetect=noise=${noiseDb}dB:d=${minDurationSec}`,
    "-f",
    "null",
    "-",
  ]);
  const ranges: SilenceRange[] = [];
  const startRe = /silence_start:\s*([0-9.]+)/g;
  const endRe = /silence_end:\s*([0-9.]+)/g;
  const starts: number[] = [];
  const ends: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(stderr))) starts.push(Number(m[1]));
  while ((m = endRe.exec(stderr))) ends.push(Number(m[1]));
  for (let i = 0; i < starts.length; i++) {
    ranges.push({ start: starts[i], end: ends[i] ?? starts[i] });
  }
  return ranges;
}

export async function extractAudio(filePath: string, outWavPath: string) {
  await runFfmpeg(["-y", "-i", filePath, "-vn", "-ac", "1", "-ar", "16000", outWavPath]);
}

export async function extractThumbnail(filePath: string, atSec: number, outJpgPath: string) {
  await runFfmpeg(["-y", "-ss", String(Math.max(0, atSec)), "-i", filePath, "-frames:v", "1", "-q:v", "3", outJpgPath]);
}

// ffmpeg writes filter analysis output (scene/silence markers) to stderr and
// exits non-zero for a null-muxer run with no real output — that's expected,
// so we read stderr regardless of exit status instead of throwing.
async function runFfmpeg(args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync(FFMPEG_BIN, args, { maxBuffer: MAX_BUFFER });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    if (typeof e.stderr === "string") {
      return { stdout: e.stdout ?? "", stderr: e.stderr };
    }
    throw err;
  }
}
