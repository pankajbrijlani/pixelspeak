import sharp from "sharp";

export interface PhotoAnalysis {
  width: number;
  height: number;
  sharpness: number; // higher = crisper focus, proxy for "not blurry"
  brightness: number; // 0-255 mean luma
}

// A Laplacian kernel highlights edges; the variance of the edge-response
// image is a standard cheap proxy for focus (blurry photos have low-variance
// edges, sharp ones have high-variance edges). This avoids pulling in a full
// CV library just to cull blurry shots.
const LAPLACIAN_KERNEL = {
  width: 3,
  height: 3,
  kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0],
};

export async function analyzePhoto(filePath: string): Promise<PhotoAnalysis> {
  const image = sharp(filePath);
  const metadata = await image.metadata();

  const edges = await sharp(filePath)
    .greyscale()
    .convolve(LAPLACIAN_KERNEL)
    .stats();

  const brightnessStats = await sharp(filePath).greyscale().stats();

  const edgeStdev = edges.channels[0]?.stdev ?? 0;

  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    sharpness: edgeStdev * edgeStdev,
    brightness: brightnessStats.channels[0]?.mean ?? 128,
  };
}
