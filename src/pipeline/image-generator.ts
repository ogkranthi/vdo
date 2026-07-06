import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { Scene, SceneWithImage } from '../types';

const IMAGE_MODEL = process.env.IMAGE_MODEL || 'imagen-4.0-generate-001';
const FALLBACK_MODEL = process.env.IMAGE_FALLBACK_MODEL || 'gemini-3.1-flash-image';
const DELAY_MS = 600; // between calls, to stay clear of rate limits

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Generates one 9:16 image per scene.
 *  - Imagen 4 primary, Gemini image model as fallback.
 *  - Do NOT pass safetyFilterLevel — Imagen 4 rejects everything except
 *    block_low_and_above; omitting it entirely is the fix.
 *  - Images are cached to disk per job: if the pipeline crashes mid-run,
 *    already-generated images are skipped on restart.
 */
export async function generateImages(
  scenes: Scene[],
  jobId: string,
  log: (msg: string) => void = console.log,
): Promise<SceneWithImage[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set.');
  const ai = new GoogleGenAI({ apiKey });

  const jobDir = path.resolve('temp', jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const out: SceneWithImage[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const imagePath = path.join(jobDir, `scene-${String(i + 1).padStart(2, '0')}.png`);

    if (fs.existsSync(imagePath) && fs.statSync(imagePath).size > 0) {
      log(`  scene ${i + 1}/${scenes.length}: cached, skipping`);
      out.push({ ...scene, imagePath });
      continue;
    }

    log(`  scene ${i + 1}/${scenes.length}: ${scene.visualType}`);
    const bytes = await generateOne(ai, scene, log);
    fs.writeFileSync(imagePath, bytes);
    out.push({ ...scene, imagePath });

    if (i < scenes.length - 1) await sleep(DELAY_MS);
  }
  return out;
}

async function generateOne(
  ai: GoogleGenAI,
  scene: Scene,
  log: (msg: string) => void,
): Promise<Buffer> {
  try {
    const result = await ai.models.generateImages({
      model: IMAGE_MODEL,
      prompt: scene.imagePrompt,
      config: { numberOfImages: 1, aspectRatio: '9:16' },
    });
    const b64 = result.generatedImages?.[0]?.image?.imageBytes;
    if (!b64) throw new Error('Imagen returned no image data.');
    return Buffer.from(b64, 'base64');
  } catch (err) {
    log(`    primary model failed (${(err as Error).message}), trying fallback...`);
    return generateFallback(ai, scene);
  }
}

async function generateFallback(ai: GoogleGenAI, scene: Scene): Promise<Buffer> {
  const result = await ai.models.generateContent({
    model: FALLBACK_MODEL,
    contents: scene.imagePrompt,
    config: { responseModalities: ['IMAGE', 'TEXT'] },
  });
  const parts = result.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      return Buffer.from(part.inlineData.data, 'base64');
    }
  }
  throw new Error('Fallback image model returned no image data.');
}
