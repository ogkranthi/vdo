import React from 'react';
import { Composition } from 'remotion';
import { ArticleVideo, ArticleVideoProps } from './ArticleVideo';

const FPS = 30;

const defaultProps: ArticleVideoProps = {
  scenes: [],
  accent: '#7DC242',
  textColor: '#FFFFFF',
  background: '#000000',
  watermark: '@YourHandle',
  watermarkOpacity: 0.4,
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="ArticleVideo"
      component={ArticleVideo}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={60 * FPS}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => {
        const totalSeconds = props.scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
        return { durationInFrames: Math.max(FPS, Math.round(totalSeconds * FPS)) };
      }}
    />
  );
};
