import { GoogleGenAI } from '@google/genai';
import { Article, PostPackage, VideoScript } from '../types';
import { BRAND } from '../brand';

const TEXT_MODEL = process.env.TEXT_MODEL || 'gemini-2.5-flash';

interface RawPackage {
  videoTitle?: string;
  captionBody?: string;
  captionHashtags?: string[];
  firstCommentHashtags?: string[];
  pinterestTitle?: string;
  pinterestDescription?: string;
}

export async function generateMetadata(
  article: Article,
  script: VideoScript,
  promoteProduct: boolean,
): Promise<PostPackage> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set.');
  const ai = new GoogleGenAI({ apiKey });

  const promoNote = promoteProduct
    ? `\n- Work a natural one-line product mention into the caption body: "If you want the exact framework, grab ${BRAND.product.name}" with the link ${BRAND.product.url}.`
    : '';

  const prompt = `You write social media post packages for short-form videos.

The video was generated from this article:
TITLE: ${article.title}
HOOK: ${script.scenes[0]?.caption}
SCENE CAPTIONS:
${script.scenes.map((s, i) => `[${i + 1}] ${s.caption}`).join('\n')}

Write the complete post package. Rules:
- videoTitle: TikTok/Reels on-platform title, curiosity-driven, under 100 characters.
- captionBody: 2-3 sentence hook caption ending with "Follow for more solopreneur insights!". No hashtags inside the body.${promoNote}
- captionHashtags: exactly 10 hashtags. The first ${BRAND.brandHashtags.length} MUST be: ${BRAND.brandHashtags.join(' ')}. Fill the rest with broad-reach tags for the platform and niche.
- firstCommentHashtags: exactly 10 MORE hashtags, topic-specific to the article content (posted as the first comment for extra reach).
- pinterestTitle: SEO-optimized curiosity-gap hook, under 100 characters.
- pinterestDescription: 2-4 sentence tease of the article's value, then ${BRAND.brandHashtags.join(' ')}.

Return ONLY this JSON shape:
{
  "videoTitle": string,
  "captionBody": string,
  "captionHashtags": string[],
  "firstCommentHashtags": string[],
  "pinterestTitle": string,
  "pinterestDescription": string
}`;

  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt,
    config: { responseMimeType: 'application/json', maxOutputTokens: 8192 },
  });

  const text = response.text;
  if (!text) throw new Error('Metadata generator returned an empty response.');
  const raw = JSON.parse(text) as RawPackage;

  return {
    videoTitle: raw.videoTitle || article.title,
    captionBody: raw.captionBody || '',
    captionHashtags: (raw.captionHashtags || []).slice(0, 10),
    firstCommentHashtags: (raw.firstCommentHashtags || []).slice(0, 10),
    pinterestTitle: raw.pinterestTitle || article.title,
    pinterestDescription: raw.pinterestDescription || '',
  };
}

/** Formats the post package into the copy-paste .txt file. */
export function formatPostPackage(pkg: PostPackage): string {
  return `================================================================
TIKTOK / REELS
================================================================

On-Platform Title:
${pkg.videoTitle}

Caption:
${pkg.captionBody}

${pkg.captionHashtags.join(' ')}

First Comment (post immediately after):
${pkg.firstCommentHashtags.join(' ')}

================================================================
PINTEREST
================================================================

Title:
${pkg.pinterestTitle}

Description:
${pkg.pinterestDescription}
`;
}
