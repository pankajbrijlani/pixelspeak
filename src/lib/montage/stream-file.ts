import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { NextRequest, NextResponse } from "next/server";

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
};

/** Serves a local file with HTTP Range support, so <video> seeking works. */
export async function streamFile(req: NextRequest, filePath: string, ext: string) {
  const stats = await stat(filePath);
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
  const range = req.headers.get("range");

  if (!range) {
    const stream = Readable.toWeb(createReadStream(filePath)) as NodeWebReadableStream;
    return new NextResponse(stream as unknown as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stats.size),
        "Accept-Ranges": "bytes",
      },
    });
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  const start = match?.[1] ? Number(match[1]) : 0;
  const end = match?.[2] ? Number(match[2]) : stats.size - 1;
  const chunkSize = end - start + 1;

  const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as NodeWebReadableStream;
  return new NextResponse(stream as unknown as ReadableStream, {
    status: 206,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(chunkSize),
      "Content-Range": `bytes ${start}-${end}/${stats.size}`,
      "Accept-Ranges": "bytes",
    },
  });
}
