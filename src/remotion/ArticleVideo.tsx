import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { RenderableScene } from '../types';
import { Scene } from './components/Scene';

export type ArticleVideoProps = {
  scenes: RenderableScene[];
  accent: string;
  textColor: string;
  background: string;
  watermark: string;
  watermarkOpacity: number;
};

export const ArticleVideo: React.FC<ArticleVideoProps> = ({
  scenes,
  accent,
  textColor,
  background,
  watermark,
  watermarkOpacity,
}) => {
  const { fps } = useVideoConfig();
  let from = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: background }}>
      {scenes.map((scene, i) => {
        const durationInFrames = Math.round(scene.durationSeconds * fps);
        const sequence = (
          <Sequence key={i} from={from} durationInFrames={durationInFrames}>
            <Scene
              scene={scene}
              sceneIndex={i}
              accent={accent}
              textColor={textColor}
              watermark={watermark}
              watermarkOpacity={watermarkOpacity}
            />
          </Sequence>
        );
        from += durationInFrames;
        return sequence;
      })}
    </AbsoluteFill>
  );
};
