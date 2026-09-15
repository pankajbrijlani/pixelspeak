import http from "node:http";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { STORAGE_ROOT } from "./storage";

// Remotion's renderer downloads <Video>/<Img> sources over HTTP(S) — it
// won't read arbitrary local file:// paths — so uploaded footage (which
// lives outside the Remotion project's bundled public/ dir) needs to be
// served over loopback HTTP for the duration of a render. Bound to
// 127.0.0.1 and scoped to STORAGE_ROOT only.
let server: http.Server | null = null;
let port = 0;

export async function ensureAssetServer(): Promise<number> {
  if (server) return port;

  server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url ?? "", "http://127.0.0.1");
      const requestedPath = decodeURIComponent(url.pathname.slice(1));
      const resolved = path.resolve(requestedPath);
      if (!resolved.startsWith(STORAGE_ROOT) || !existsSync(resolved)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200);
      const stream = createReadStream(resolved);
      stream.on("error", () => res.end());
      stream.pipe(res);
    } catch {
      res.writeHead(400);
      res.end();
    }
  });

  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  port = typeof address === "object" && address ? address.port : 0;
  return port;
}

export function assetUrl(assetServerPort: number, absolutePath: string): string {
  return `http://127.0.0.1:${assetServerPort}/${encodeURIComponent(absolutePath)}`;
}
