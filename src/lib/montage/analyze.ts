import path from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { detectScenes, detectSilence, extractAudio, probe } from "./ffmpeg";
import { analyzePhoto } from "./photo";
import { transcribeAudio } from "./transcribe";
import { projectDir } from "./storage";

export interface VideoAnalysis {
  kind: "video";
  scenes: number[];
  silences: { start: number; end: number }[];
  transcript: { start: number; end: number; text: string }[] | null;
}

export interface PhotoAnalysisResult {
  kind: "photo";
  sharpness: number;
  brightness: number;
}

export async function analyzeAsset(assetId: string) {
  const asset = await prisma.montageAsset.findUniqueOrThrow({ where: { id: assetId } });
  await prisma.montageAsset.update({ where: { id: assetId }, data: { status: "ANALYZING" } });

  try {
    if (asset.type === "VIDEO") {
      const { durationSec, width, height } = await probe(asset.storagePath);
      const [scenes, silences] = await Promise.all([
        detectScenes(asset.storagePath),
        detectSilence(asset.storagePath),
      ]);

      let transcript: VideoAnalysis["transcript"] = null;
      if (process.env.OPENAI_API_KEY) {
        const tmpDir = path.join(projectDir(asset.projectId), "tmp");
        await mkdir(tmpDir, { recursive: true });
        const wavPath = path.join(tmpDir, `${assetId}.wav`);
        try {
          await extractAudio(asset.storagePath, wavPath);
          transcript = await transcribeAudio(wavPath);
        } finally {
          await rm(wavPath, { force: true });
        }
      }

      const analysis: VideoAnalysis = { kind: "video", scenes, silences, transcript };
      await prisma.montageAsset.update({
        where: { id: assetId },
        data: { durationSec, width, height, analysis: analysis as object, status: "READY" },
      });
    } else {
      const { width, height, sharpness, brightness } = await analyzePhoto(asset.storagePath);
      const analysis: PhotoAnalysisResult = { kind: "photo", sharpness, brightness };
      await prisma.montageAsset.update({
        where: { id: assetId },
        data: { width, height, analysis: analysis as object, status: "READY" },
      });
    }
  } catch (err) {
    await prisma.montageAsset.update({
      where: { id: assetId },
      data: { status: "FAILED", errorMessage: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}
