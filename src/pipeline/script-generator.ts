import { GoogleGenAI } from '@google/genai';
import { Article, Scene, VideoScript, VideoStyle, VIDEO_STYLES } from '../types';
import { BRAND } from '../brand';
import { applyVisualTreatment } from './visual-types';
import { loadHistory } from './history-tracker';

const TEXT_MODEL = process.env.TEXT_MODEL || 'gemini-2.5-flash';

const STYLE_GUIDE = `
Video styles — pick the ONE that best fits the article's tone and structure
(or use the forced style if one is given):
- PUNCHY_CUTS: short declarative statements, one idea per scene, high tempo.
- STORY_ARC: problem, struggle, insight, result — told like a personal confession.
- MYTH_BUSTER: common belief stated, then dismantled scene by scene.
- RAPID_FIRE: quick list of tips/facts, minimal connective tissue.
- DEEP_REVEAL: builds tension toward one core insight revealed near the end.
- LIST_FORMAT: numbered walk-through of steps or items.

Hook styles (first scene, first 3 seconds — must stop the scroll):
PERSONAL_CONFESSION, SHOCKING_STAT, CONTRARIAN_TAKE, DIRECT_QUESTION,
BOLD_PROMISE, RELATABLE_PAIN.
`;

interface RawScene {
  durationSeconds?: number;
  caption?: string;
  subCaption?: string;
  imagePrompt?: string;
  visualType?: string;
}

interface RawScript {
  hookStyle?: string;
  videoStyle?: string;
  scenes?: RawScene[];
}

export interface ScriptOptions {
  freshAngle?: boolean;
  forceStyle?: VideoStyle;
}

export async function generateScript(
  article: Article,
  options: ScriptOptions = {},
): Promise<VideoScript> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.');
  const ai = new GoogleGenAI({ apiKey });

  const prompt = buildPrompt(article, options);

  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt,
    config: {
      // Both settings are non-negotiable:
      // - responseMimeType forces raw JSON, no markdown fences
      // - the default token limit truncates 11-scene scripts mid-JSON
      responseMimeType: 'application/json',
      maxOutputTokens: 8192,
    },
  });

  const text = response.text;
  if (!text) throw new Error('Script generator returned an empty response.');

  let raw: RawScript;
  try {
    raw = JSON.parse(text) as RawScript;
  } catch (err) {
    throw new Error(`Script generator returned invalid JSON: ${(err as Error).message}\n---\n${text.slice(0, 500)}`);
  }

  return validateScript(raw, options.forceStyle);
}

function buildPrompt(article: Article, options: ScriptOptions): string {
  const freshAngleNote = options.freshAngle
    ? '\nIMPORTANT: This article has been turned into a video before. Find a COMPLETELY DIFFERENT angle on the same content — different hook, different framing, different scenes.\n'
    : '';
  const styleNote = options.forceStyle
    ? `\nFORCED STYLE: You MUST use videoStyle "${options.forceStyle}".\n`
    : '';

  return `You are a short-form video scriptwriter. Turn the article below into a ${BRAND.targetDuration} vertical video script with ${BRAND.minScenes}-${BRAND.maxScenes} scenes.

${STYLE_GUIDE}
${styleNote}${freshAngleNote}
Rules:
- caption: max 15 words, punchy, written for muted viewing — the captions alone must tell the story.
- subCaption (optional): max 8 words, supporting detail.
- durationSeconds: 4-8 per scene; total ${BRAND.targetDuration}.
- imagePrompt: describe ONLY the physical scene — a character, an action, an emotion, objects. No style directions, no colors, no camera angles (those are layered on later). NEVER describe text, letters, signs, numbers, or symbols in the scene.
- The first scene is the hook. The last scene is the payoff.

Return ONLY this JSON shape:
{
  "hookStyle": string,
  "videoStyle": "PUNCHY_CUTS" | "STORY_ARC" | "MYTH_BUSTER" | "RAPID_FIRE" | "DEEP_REVEAL" | "LIST_FORMAT",
  "scenes": [{
    "durationSeconds": number,
    "caption": string,
    "subCaption": string (optional),
    "imagePrompt": string,
    "visualType": string
  }]
}

ARTICLE TITLE: ${article.title}

ARTICLE:
${article.content}`;
}

function validateScript(raw: RawScript, forceStyle?: VideoStyle): VideoScript {
  if (!raw.scenes || !Array.isArray(raw.scenes) || raw.scenes.length === 0) {
    throw new Error('Script has no scenes.');
  }

  const videoStyle: VideoStyle =
    forceStyle ??
    (VIDEO_STYLES.includes(raw.videoStyle as VideoStyle)
      ? (raw.videoStyle as VideoStyle)
      : 'STORY_ARC');

  const clampWords = (s: string, max: number) => s.split(/\s+/).slice(0, max).join(' ');

  let scenes: Scene[] = raw.scenes
    .filter((s): s is RawScene => Boolean(s && s.caption && s.imagePrompt))
    .slice(0, BRAND.maxScenes)
    .map((s) => ({
      durationSeconds: Math.min(8, Math.max(3, Number(s.durationSeconds) || 5)),
      caption: clampWords(String(s.caption).trim(), 15),
      subCaption: s.subCaption ? clampWords(String(s.subCaption).trim(), 8) : undefined,
      imagePrompt: String(s.imagePrompt).trim(),
      visualType: String(s.visualType || ''),
    }));

  if (scenes.length < 3) {
    throw new Error(`Script only produced ${scenes.length} usable scenes — need at least 3.`);
  }

  // The algorithm, not the model, owns visual types + prompt layering.
  // Seed off history size so every run gets different treatment.
  scenes = applyVisualTreatment(scenes, loadHistory().totalVideos);

  return { hookStyle: String(raw.hookStyle || 'PERSONAL_CONFESSION'), videoStyle, scenes };
}
