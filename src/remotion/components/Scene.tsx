import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { RenderableScene } from '../../types';
import { Caption } from './Caption';

const FADE_FRAMES = 9;

/** 8 Ken Burns presets — [scaleFrom, scaleTo, xDrift, yDrift] — cycling per scene. */
const KEN_BURNS: Array<[number, number, number, number]> = [
  [1.0, 1.12, 0, 0],
  [1.12, 1.0, 0, 0],
  [1.05, 1.15, -25, 0],
  [1.05, 1.15, 25, 0],
  [1.15, 1.05, 0, -20],
  [1.15, 1.05, 0, 20],
  [1.0, 1.1, 20, -15],
  [1.1, 1.0, -20, 15],
];

interface SceneProps {
  scene: RenderableScene;
  sceneIndex: number;
  accent: string;
  textColor: string;
  watermark: string;
  watermarkOpacity: number;
}

export const Scene: React.FC<SceneProps> = ({
  scene,
  sceneIndex,
  accent,
  textColor,
  watermark,
  watermarkOpacity,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationInFrames = Math.round(scene.durationSeconds * fps);

  const [scaleFrom, scaleTo, xDrift, yDrift] = KEN_BURNS[sceneIndex % KEN_BURNS.length];
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const scale = scaleFrom + (scaleTo - scaleFrom) * progress;
  const translateX = xDrift * progress;
  const translateY = yDrift * progress;

  // 9-frame fade in/out at each scene boundary
  const opacity = interpolate(
    frame,
    [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill>
        <Img
          src={scene.imageDataUri}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
          }}
        />
      </AbsoluteFill>

      {/* Top + bottom vignettes so captions stay readable */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 22%)',
        }}
      />
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 38%)',
        }}
      />

      {/* Watermark, top-left */}
      <div
        style={{
          position: 'absolute',
          top: 60,
          left: 50,
          color: textColor,
          opacity: watermarkOpacity,
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: 34,
          fontWeight: 700,
          letterSpacing: 1,
        }}
      >
        {watermark}
      </div>

      <Caption
        caption={scene.caption}
        subCaption={scene.subCaption}
        sceneIndex={sceneIndex}
        durationInFrames={durationInFrames}
        accent={accent}
        textColor={textColor}
      />
    </AbsoluteFill>
  );
};
