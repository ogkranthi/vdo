import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

type CaptionStyle = 'word-by-word' | 'highlight' | 'all-at-once';
const STYLES: CaptionStyle[] = ['word-by-word', 'highlight', 'all-at-once'];

interface CaptionProps {
  caption: string;
  subCaption?: string;
  sceneIndex: number;
  durationInFrames: number;
  accent: string;
  textColor: string;
}

/**
 * Rotates through 3 caption animation styles per scene:
 *  - word-by-word: words appear one at a time, synced to frame timing
 *  - highlight: full line visible, current word glows in the accent color
 *  - all-at-once: whole line slides in with a spring
 * A lime-green accent bar animates in on entry; subCaption sits below.
 */
export const Caption: React.FC<CaptionProps> = ({
  caption,
  subCaption,
  sceneIndex,
  durationInFrames,
  accent,
  textColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const style = STYLES[sceneIndex % STYLES.length];
  const words = caption.split(/\s+/);

  // Words resolve across the first ~60% of the scene
  const revealWindow = durationInFrames * 0.6;
  const framesPerWord = revealWindow / words.length;

  const barScale = spring({ frame, fps, config: { damping: 14 }, durationInFrames: 20 });

  const slideIn = spring({ frame, fps, config: { damping: 12 }, durationInFrames: 25 });
  const slideY = interpolate(slideIn, [0, 1], [60, 0]);

  const renderWords = () =>
    words.map((word, i) => {
      const wordStart = i * framesPerWord;
      let opacity = 1;
      let color = textColor;
      let textShadow = '0 4px 24px rgba(0,0,0,0.9)';

      if (style === 'word-by-word') {
        opacity = interpolate(frame, [wordStart, wordStart + 6], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
      } else if (style === 'highlight') {
        const isCurrent = frame >= wordStart && frame < wordStart + framesPerWord;
        if (isCurrent) {
          color = accent;
          textShadow = `0 0 30px ${accent}, 0 4px 24px rgba(0,0,0,0.9)`;
        }
      }

      return (
        <span
          key={i}
          style={{ opacity, color, textShadow, marginRight: '0.28em', display: 'inline-block' }}
        >
          {word}
        </span>
      );
    });

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 260,
        left: 70,
        right: 70,
        transform: style === 'all-at-once' ? `translateY(${slideY}px)` : undefined,
        opacity: style === 'all-at-once' ? slideIn : 1,
      }}
    >
      {/* Accent bar */}
      <div
        style={{
          width: 140,
          height: 12,
          backgroundColor: accent,
          marginBottom: 28,
          transform: `scaleX(${barScale})`,
          transformOrigin: 'left',
          borderRadius: 6,
        }}
      />
      <div
        style={{
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: 68,
          fontWeight: 800,
          lineHeight: 1.2,
          color: textColor,
        }}
      >
        {renderWords()}
      </div>
      {subCaption ? (
        <div
          style={{
            marginTop: 22,
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: 42,
            fontWeight: 600,
            color: accent,
            textShadow: '0 4px 20px rgba(0,0,0,0.9)',
          }}
        >
          {subCaption}
        </div>
      ) : null}
    </div>
  );
};
