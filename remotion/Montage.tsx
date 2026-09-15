import React from "react";
import { z } from "zod";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

// A zod schema (rather than a bare TS interface) is what lets Remotion's
// <Composition> infer prop types through calculateMetadata without the
// generic-inference dead end that a schema-less Composition<Props> hits.
export const montageSegmentSchema = z.object({
  id: z.string(),
  type: z.enum(["VIDEO", "PHOTO"]),
  src: z.string(),
  inSec: z.number(),
  outSec: z.number(),
  speed: z.number(),
  caption: z.string().nullable().optional(),
});

export const montageSchema = z.object({
  segments: z.array(montageSegmentSchema),
  fps: z.number(),
  musicSrc: z.string().nullable().optional(),
});

export type MontageSegmentProps = z.infer<typeof montageSegmentSchema>;
export type MontageProps = z.infer<typeof montageSchema>;

const TRANSITION_FRAMES = 8;

function segmentDurationInFrames(segment: MontageSegmentProps, fps: number) {
  return Math.max(1, Math.round(((segment.outSec - segment.inSec) / segment.speed) * fps));
}

export function calculateMontageDurationInFrames(segments: MontageSegmentProps[], fps: number) {
  if (segments.length === 0) return fps; // 1s placeholder so an empty composition is still valid
  const raw = segments.reduce((sum, s) => sum + segmentDurationInFrames(s, fps), 0);
  const overlaps = Math.max(0, segments.length - 1) * TRANSITION_FRAMES;
  return Math.max(fps, raw - overlaps);
}

const KenBurnsPhoto: React.FC<{ src: string; direction: 1 | -1 }> = ({ src, direction }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const translate = interpolate(frame, [0, durationInFrames], [0, direction * 20], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "black" }}>
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translateX(${translate}px)`,
        }}
      />
    </AbsoluteFill>
  );
};

const CaptionOverlay: React.FC<{ text: string }> = ({ text }) => (
  <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 90 }}>
    <div
      style={{
        maxWidth: "82%",
        padding: "10px 22px",
        borderRadius: 12,
        backgroundColor: "rgba(0,0,0,0.55)",
        color: "white",
        fontSize: 34,
        fontFamily: "Inter, system-ui, sans-serif",
        fontWeight: 600,
        textAlign: "center",
        lineHeight: 1.25,
      }}
    >
      {text}
    </div>
  </AbsoluteFill>
);

export const Montage: React.FC<MontageProps> = ({ segments, fps }) => {
  if (segments.length === 0) {
    return <AbsoluteFill style={{ backgroundColor: "black" }} />;
  }

  return (
    <TransitionSeries>
      {segments.flatMap((segment, index) => {
        const durationInFrames = segmentDurationInFrames(segment, fps);
        const items: React.ReactNode[] = [
          <TransitionSeries.Sequence key={segment.id} durationInFrames={durationInFrames}>
            {segment.type === "VIDEO" ? (
              <AbsoluteFill style={{ backgroundColor: "black" }}>
                <OffthreadVideo
                  src={segment.src}
                  trimBefore={Math.round(segment.inSec * fps)}
                  trimAfter={Math.round(segment.outSec * fps)}
                  playbackRate={segment.speed}
                  volume={segment.speed > 1.4 ? 0.15 : 0.8}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                {segment.caption && <CaptionOverlay text={segment.caption} />}
              </AbsoluteFill>
            ) : (
              <KenBurnsPhoto src={segment.src} direction={index % 2 === 0 ? 1 : -1} />
            )}
          </TransitionSeries.Sequence>,
        ];

        const isLast = index === segments.length - 1;
        if (!isLast && durationInFrames > TRANSITION_FRAMES * 2) {
          items.push(
            <TransitionSeries.Transition
              key={`${segment.id}-transition`}
              timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
              presentation={fade()}
            />,
          );
        }
        return items;
      })}
    </TransitionSeries>
  );
};
