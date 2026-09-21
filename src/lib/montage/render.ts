import path from "node:path";
import fs from "node:fs";
import { mkdir } from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { prisma } from "@/lib/prisma";
import { outputPath } from "./storage";
import { ensureAssetServer, assetUrl } from "./asset-server";
import type { MontageProps } from "../../../remotion/Montage";

export const MONTAGE_FPS = 30;

// Bundling the Remotion project (webpack) takes several seconds; cache it
// for the lifetime of the server process instead of redoing it per render.
let bundleLocationPromise: Promise<string> | null = null;

function getBundleLocation(): Promise<string> {
  if (!bundleLocationPromise) {
    bundleLocationPromise = bundle({
      entryPoint: path.join(process.cwd(), "remotion", "index.ts"),
      outDir: path.join(process.cwd(), ".remotion-bundle"),
      onProgress: () => {},
    }).catch((err) => {
      bundleLocationPromise = null; // allow retry on next render instead of caching a failure
      throw err;
    });
  }
  return bundleLocationPromise;
}

// Remotion normally downloads its own headless Chrome; this environment
// doesn't have outbound access for that, so we point it at the Playwright
// Chromium headless-shell binary this container already ships with. Override
// via REMOTION_BROWSER_EXECUTABLE for other environments (e.g. production).
function findBrowserExecutable(): string | undefined {
  const fromEnv = process.env.REMOTION_BROWSER_EXECUTABLE;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const candidates = fs.existsSync("/opt/pw-browsers")
    ? fs
        .readdirSync("/opt/pw-browsers")
        .filter((name) => name.startsWith("chromium_headless_shell"))
        .map((name) => path.join("/opt/pw-browsers", name, "chrome-linux", "headless_shell"))
    : [];

  return candidates.find((p) => fs.existsSync(p));
}

export async function renderProject(projectId: string): Promise<string> {
  const segments = await prisma.montageSegment.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
    include: { asset: true },
  });

  if (segments.length === 0) {
    throw new Error("No segments were selected for this project — nothing to render.");
  }

  const assetServerPort = await ensureAssetServer();

  const inputProps: MontageProps = {
    fps: MONTAGE_FPS,
    musicSrc: null,
    segments: segments.map((s) => ({
      id: s.id,
      type: s.type,
      src: assetUrl(assetServerPort, s.asset.storagePath),
      inSec: s.inSec,
      outSec: s.outSec,
      speed: s.speed,
      caption: s.caption,
    })),
  };

  const serveUrl = await getBundleLocation();
  const browserExecutable = findBrowserExecutable();
  // renderMedia/selectComposition take untyped `Record<string, unknown>` props;
  // the zod schema on the composition itself is what validates this at runtime.
  const rawInputProps = inputProps as unknown as Record<string, unknown>;

  const composition = await selectComposition({
    serveUrl,
    id: "Montage",
    inputProps: rawInputProps,
    browserExecutable,
  });

  const destination = outputPath(projectId);
  await mkdir(path.dirname(destination), { recursive: true });

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: destination,
    inputProps: rawInputProps,
    browserExecutable,
    chromiumOptions: { headless: true },
    // Default is 30s for the whole render to resolve its first frame's
    // delayRender() calls; high-resolution source footage without hardware
    // video decoding available can need longer than that per frame.
    timeoutInMilliseconds: 180000,
  });

  await prisma.montageProject.update({ where: { id: projectId }, data: { outputPath: destination } });
  return destination;
}
