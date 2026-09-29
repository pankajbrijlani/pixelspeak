import { writeFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { MONTAGE_FPS } from "./render";
import { xmlPath } from "./storage";

// Must match the Composition dimensions in remotion/Root.tsx.
const WIDTH = 1080;
const HEIGHT = 1920;

export interface XmlSegment {
  type: "VIDEO" | "PHOTO";
  inSec: number;
  outSec: number;
  speed: number;
  asset: { originalName: string; storagePath: string };
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// FCP7 XML (and Premiere's importer) expects a file:// URL with each path
// segment percent-encoded, not the raw filesystem path.
function fileUrl(absolutePath: string): string {
  const encoded = absolutePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `file://localhost${encoded}`;
}

/**
 * Builds a Final Cut Pro 7 XML (xmeml v5) sequence — the standard
 * interchange format Premiere Pro imports — referencing the original
 * per-clip source files rather than the flattened render, so the cut can
 * be fine-tuned with the real footage in an NLE.
 *
 * Speed changes are expressed the standard way: `in`/`out` are the source
 * clip's native-speed frame range, while `start`/`end` are the (shorter or
 * longer) timeline frame range — the ratio between them is what NLEs read
 * as the clip's playback speed, no explicit speed filter required.
 *
 * Deliberately doesn't attempt transitions or Ken Burns moves on photos —
 * those are exactly the kind of thing worth doing by hand once the cut is
 * in a real NLE, not worth the schema risk of getting right blind here.
 */
export function buildPremiereXml(projectName: string, segments: XmlSegment[]): string {
  const fps = MONTAGE_FPS;
  const fileIdByPath = new Map<string, string>();
  let fileCounter = 0;
  let clipCounter = 0;
  let timelineFrame = 0;

  const videoClipItems: string[] = [];
  const audioClipItems: string[] = [];

  for (const seg of segments) {
    const durationFrames = Math.max(1, Math.round(((seg.outSec - seg.inSec) / seg.speed) * fps));
    const sourceInFrame = Math.round(seg.inSec * fps);
    const sourceOutFrame = sourceInFrame + Math.round((seg.outSec - seg.inSec) * fps);
    const start = timelineFrame;
    const end = timelineFrame + durationFrames;
    timelineFrame = end;
    clipCounter++;

    let fileId = fileIdByPath.get(seg.asset.storagePath);
    let fileBlock: string;
    if (!fileId) {
      fileId = `file-${++fileCounter}`;
      fileIdByPath.set(seg.asset.storagePath, fileId);
      const audioMedia = seg.type === "VIDEO" ? "<audio/>" : "";
      fileBlock = `<file id="${fileId}">
              <name>${xmlEscape(seg.asset.originalName)}</name>
              <pathurl>${xmlEscape(fileUrl(seg.asset.storagePath))}</pathurl>
              <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
              <media>
                <video><samplecharacteristics><width>${WIDTH}</width><height>${HEIGHT}</height></samplecharacteristics></video>
                ${audioMedia}
              </media>
            </file>`;
    } else {
      fileBlock = `<file id="${fileId}"/>`;
    }

    const clipName = xmlEscape(seg.asset.originalName);

    videoClipItems.push(`
          <clipitem id="clipitem-v${clipCounter}">
            <name>${clipName}</name>
            <duration>${durationFrames}</duration>
            <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
            <start>${start}</start>
            <end>${end}</end>
            <in>${sourceInFrame}</in>
            <out>${sourceOutFrame}</out>
            ${fileBlock}
          </clipitem>`);

    if (seg.type === "VIDEO") {
      audioClipItems.push(`
          <clipitem id="clipitem-a${clipCounter}">
            <name>${clipName}</name>
            <duration>${durationFrames}</duration>
            <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
            <start>${start}</start>
            <end>${end}</end>
            <in>${sourceInFrame}</in>
            <out>${sourceOutFrame}</out>
            <file id="${fileId}"/>
          </clipitem>`);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence>
    <name>${xmlEscape(projectName)}</name>
    <duration>${timelineFrame}</duration>
    <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
            <width>${WIDTH}</width>
            <height>${HEIGHT}</height>
          </samplecharacteristics>
        </format>
        <track>${videoClipItems.join("")}
        </track>
      </video>
      <audio>
        <track>${audioClipItems.join("")}
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>`;
}

/**
 * Builds the XML for a project and writes it into that project's local
 * folder, right alongside originals/ and output.mp4 — so opening the one
 * folder in Finder shows the source clips, the rendered preview, and the
 * Premiere sequence together, no separate browser download needed.
 */
export async function savePremiereXml(projectId: string): Promise<string> {
  const project = await prisma.montageProject.findUniqueOrThrow({ where: { id: projectId } });
  const segments = await prisma.montageSegment.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
    include: { asset: true },
  });

  const xml = buildPremiereXml(
    project.name,
    segments.map((s) => ({
      type: s.type,
      inSec: s.inSec,
      outSec: s.outSec,
      speed: s.speed,
      asset: { originalName: s.asset.originalName, storagePath: s.asset.storagePath },
    })),
  );

  const destination = xmlPath(projectId);
  await writeFile(destination, xml);
  return destination;
}
