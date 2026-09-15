import React from "react";
import { Composition } from "remotion";
import { Montage, calculateMontageDurationInFrames, montageSchema, type MontageProps } from "./Montage";

const defaultProps: MontageProps = {
  segments: [],
  fps: 30,
  musicSrc: null,
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Montage"
      component={Montage}
      schema={montageSchema}
      durationInFrames={30}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={defaultProps}
      calculateMetadata={async ({ props }) => {
        const fps = props.fps ?? 30;
        return {
          durationInFrames: calculateMontageDurationInFrames(props.segments, fps),
          fps,
        };
      }}
    />
  );
};
