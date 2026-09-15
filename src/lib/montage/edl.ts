import { prisma } from "@/lib/prisma";
import type { VideoAnalysis, PhotoAnalysisResult } from "./analyze";
import { speechDensityScore } from "./transcribe";

const MIN_CHUNK_SEC = 0.8;
const MAX_CHUNK_SEC = 4.0;
const PHOTO_DISPLAY_SEC = 2.2;
const ASSUMED_AVG_SPEED = 1.3; // used only to budget how many candidates to pick, not the final speed

interface Candidate {
  assetId: string;
  type: "VIDEO" | "PHOTO";
  captureOrder: number;
  inSec: number;
  outSec: number;
  score: number;
  caption: string | null;
}

/**
 * Splits scene-cut boundaries into playable chunks: never shorter than
 * MIN_CHUNK_SEC (too twitchy to read as a moment) and never longer than
 * MAX_CHUNK_SEC (a single "shot" in a fast montage shouldn't run long).
 */
function chunkBoundaries(scenes: number[], duration: number): [number, number][] {
  const bounds = [0, ...scenes.filter((s) => s > 0.1 && s < duration - 0.1), duration].sort((a, b) => a - b);
  const chunks: [number, number][] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i];
    const b = bounds[i + 1];
    const span = b - a;
    if (span < MIN_CHUNK_SEC / 2) continue;
    const pieces = Math.max(1, Math.round(span / MAX_CHUNK_SEC));
    const pieceLen = span / pieces;
    for (let p = 0; p < pieces; p++) {
      chunks.push([a + p * pieceLen, a + (p + 1) * pieceLen]);
    }
  }
  return chunks;
}

function overlapSec(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function jitter(seed: number) {
  // Deterministic pseudo-random tie-breaker so re-running EDL on the same
  // footage gives the same cut, but near-equal candidates don't all tie at 0.
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export async function buildEdl(projectId: string) {
  const project = await prisma.montageProject.findUniqueOrThrow({ where: { id: projectId } });
  const assets = await prisma.montageAsset.findMany({
    where: { projectId, status: "READY" },
    orderBy: { captureOrder: "asc" },
  });

  const candidates: Candidate[] = [];

  assets.forEach((asset, assetIndex) => {
    if (asset.type === "VIDEO") {
      const analysis = asset.analysis as unknown as VideoAnalysis | null;
      const duration = asset.durationSec ?? 0;
      if (!analysis || duration <= 0) return;

      for (const [inSec, outSec] of chunkBoundaries(analysis.scenes, duration)) {
        const lengthSec = outSec - inSec;
        const silenceOverlap = analysis.silences.reduce(
          (sum, s) => sum + overlapSec(inSec, outSec, s.start, s.end),
          0,
        );
        const energy = 1 - Math.min(1, silenceOverlap / lengthSec);

        let caption: string | null = null;
        let speechWords = 0;
        if (analysis.transcript) {
          const overlapping = analysis.transcript.filter((t) => overlapSec(inSec, outSec, t.start, t.end) > 0);
          if (overlapping.length > 0) {
            caption = overlapping.map((t) => t.text).join(" ").trim() || null;
            speechWords = speechDensityScore(caption ?? "");
          }
        }

        const score = 1 + energy * 3 + Math.min(speechWords, 15) * 1.2 + jitter(assetIndex * 1000 + inSec);

        candidates.push({
          assetId: asset.id,
          type: "VIDEO",
          captureOrder: asset.captureOrder,
          inSec,
          outSec,
          score,
          caption,
        });
      }
    } else {
      const analysis = asset.analysis as unknown as PhotoAnalysisResult | null;
      if (!analysis) return;
      // Sharpness variance has no universal scale, so we soft-cap it rather
      // than assume an absolute "in focus" threshold across every camera.
      const sharpnessScore = Math.min(analysis.sharpness / 50, 1) * 5;
      const score = 1 + sharpnessScore + jitter(assetIndex * 1000);

      candidates.push({
        assetId: asset.id,
        type: "PHOTO",
        captureOrder: asset.captureOrder,
        inSec: 0,
        outSec: PHOTO_DISPLAY_SEC,
        score,
        caption: null,
      });
    }
  });

  if (candidates.length === 0) {
    await prisma.montageSegment.deleteMany({ where: { projectId } });
    return { segmentCount: 0, plannedDurationSec: 0 };
  }

  const ranked = [...candidates].sort((a, b) => b.score - a.score);
  const budgetSec = project.targetDurationSec * ASSUMED_AVG_SPEED;

  const selected: Candidate[] = [];
  let runningSec = 0;
  for (const c of ranked) {
    if (runningSec >= budgetSec && selected.length > 0) break;
    selected.push(c);
    runningSec += c.outSec - c.inSec;
  }

  // Restore story order: best moments, told in the order they happened.
  selected.sort((a, b) => a.captureOrder - b.captureOrder || a.inSec - b.inSec);

  const scores = selected.map((c) => c.score);
  const sortedScores = [...scores].sort((a, b) => a - b);
  const percentile = (score: number) => sortedScores.indexOf(score) / Math.max(1, sortedScores.length - 1);

  const bestOverall = selected.reduce((best, c) => (c.score > best.score ? c : best), selected[0]);

  await prisma.montageSegment.deleteMany({ where: { projectId } });

  let plannedDurationSec = 0;
  const rows = selected.map((c, index) => {
    const p = percentile(c.score);
    let speed = p > 0.75 ? 1.0 : p > 0.3 ? 1.25 : 1.6;
    if (c === bestOverall && c.type === "VIDEO") speed = 0.6; // hero slow-mo moment
    plannedDurationSec += (c.outSec - c.inSec) / speed;

    return {
      projectId,
      assetId: c.assetId,
      order: index,
      type: c.type,
      inSec: c.inSec,
      outSec: c.outSec,
      speed,
      score: c.score,
      caption: c.caption,
    };
  });

  await prisma.montageSegment.createMany({ data: rows });

  return { segmentCount: rows.length, plannedDurationSec };
}
