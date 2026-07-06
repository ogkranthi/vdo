import fs from 'fs';
import path from 'path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { RenderableScene, SceneWithImage } from '../types';
import { BRAND } from '../brand';

export const FPS = 30;

// Optional: point at an existing Chromium/Chrome binary instead of letting
// Remotion download its own headless shell (useful in sandboxed CI).
const BROWSER_EXECUTABLE = process.env.REMOTION_BROWSER_EXECUTABLE || null;

/**
 * Remotion runs inside a browser sandbox and cannot load file:// paths —
 * skip this conversion and the video renders as black frames, silently.
 * Every image is inlined as a base64 data URI before rendering starts.
 */
export function scenesToDataURIs(scenes: SceneWithImage[]): RenderableScene[] {
  return scenes.map(({ imagePath, ...scene }) => ({
    ...scene,
    imageDataUri: `data:image/png;base64,${fs.readFileSync(imagePath).toString('base64')}`,
  }));
}

export async function renderVideo(
  scenes: SceneWithImage[],
  outputPath: string,
  log: (msg: string) => void = console.log,
): Promise<void> {
  const renderableScenes = scenesToDataURIs(scenes);

  log('  bundling Remotion project...');
  const bundleLocation = await bundle({
    entryPoint: path.resolve('src', 'remotion', 'index.ts'),
    // Keep webpack quiet; renderer logLevel is set below.
    onProgress: () => {},
  });

  const inputProps = {
    scenes: renderableScenes,
    accent: BRAND.render.accent,
    textColor: BRAND.render.text,
    background: BRAND.render.background,
    watermark: BRAND.watermark,
    watermarkOpacity: BRAND.render.watermarkOpacity,
  };

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: 'ArticleVideo',
    inputProps,
    browserExecutable: BROWSER_EXECUTABLE,
    logLevel: 'error',
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  // onProgress fires on EVERY frame — 1,800 times for a 60s video. Writing
  // to stdout that often overflows the buffer and kills the process before
  // the post package saves. Throttle to >=5% increments.
  let lastReported = -5;
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps,
    browserExecutable: BROWSER_EXECUTABLE,
    logLevel: 'error',
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 100);
      if (pct >= lastReported + 5) {
        lastReported = pct;
        log(`  rendering: ${pct}%`);
      }
    },
  });
}
