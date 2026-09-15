import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Remotion's Node renderer/bundler (and ffmpeg/ffprobe static binaries)
  // must be required at runtime, not traced/bundled by webpack — bundling
  // pulls in @remotion/studio's optional browser-only deps (e.g. a WebGPU
  // whisper model) that aren't installed and don't need to be.
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "@remotion/cli",
    "@remotion/studio",
    "ffmpeg-static",
    "ffprobe-static",
    "sharp",
  ],
};

export default nextConfig;
