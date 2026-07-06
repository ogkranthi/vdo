# Article → Video Pipeline

Turns any published article into a TikTok/Pinterest-ready vertical video —
script, illustrated scenes, animated captions, and a copy-paste post package —
from a single terminal command.

```
npm run create -- --daily
```

8–15 minutes later you get two files: a 1080×1920 `.mp4` and a `.txt` post
package with the TikTok title, caption, 20 hashtags (split caption/first
comment), Pinterest title, and Pinterest description.

## How it works

Seven stages fire in sequence:

1. **Article picker** (`src/pipeline/article-picker.ts`) — never-used articles
   first; articles used >14 days ago become eligible again with a
   `freshAngle` flag; 70/30 Medium/Substack weighting.
2. **Script generator** (`src/pipeline/script-generator.ts`) — Gemini 2.5
   Flash writes a 50–60s script with 9–11 scenes. Uses
   `responseMimeType: "application/json"` and `maxOutputTokens: 8192`
   (both non-negotiable — the defaults truncate or fence the JSON).
3. **Visual treatment** (`src/pipeline/visual-types.ts`) — an algorithm (not
   the model) assigns one of 20 visual types per scene: hook type first,
   payoff type last, no adjacent repeats, plus a perspective layer (8 camera
   angles) and atmosphere layer (8 background treatments) per prompt.
4. **Image generator** (`src/pipeline/image-generator.ts`) — Imagen 4 at 9:16
   with a Gemini image-model fallback, 600ms between calls, disk cache so a
   crashed run resumes where it stopped.
5. **Renderer** (`src/pipeline/renderer.ts` + `src/remotion/`) — Remotion
   renders 1080×1920 30fps H.264 with Ken Burns motion (8 presets), animated
   captions (3 rotating styles), vignettes, watermark, and 9-frame scene
   fades. Images are converted to base64 data URIs first — Remotion's browser
   sandbox can't load `file://` paths (black frames otherwise).
6. **Metadata generator** (`src/pipeline/metadata-generator.ts`) — one final
   Gemini call writes the full post package. Every 5th video automatically
   includes a product mention.
7. **History tracker** (`src/pipeline/history-tracker.ts`) — logs every video
   to `logs/video-history.json`, drives recency and promo cadence.

## Setup

```bash
npm install
cp .env.example .env   # add your GEMINI_API_KEY from aistudio.google.com
```

Drop your articles into `articles/` as `.md` or `.txt`. Optional frontmatter:

```yaml
---
title: Why Your KDP Book Isn't Selling
platform: medium   # or substack (affects picker weighting)
---
```

Trailing CTA blocks (subscribe/follow/product plugs in the last three
paragraphs) are stripped automatically — mid-article uses of the word
"subscribe" are left alone.

## Commands

```bash
npm run create -- --daily                        # auto-pick the next article
npm run create -- --article "Your Article Title" # specific article
npm run create -- --daily --style MYTH_BUSTER    # force a video style
npm run create -- --daily --script-only          # preview script, no cost
npm run create -- --daily --no-render            # images only, skip render
npm run create -- --list                         # list articles + usage status
```

Recommended first run: `--script-only` with your own article, read the
captions before spending anything on image generation.

## Branding

Everything visual comes from one object: `src/brand.ts`. Edit the
plain-English style/color descriptions, watermark, and product link — every
image prompt and rendered frame inherits from it. Swap the style paragraph
(flat vector, isometric 3D, paper cutout, photoreal, manga — anything) and
the whole pipeline rebrand follows.

Three rules encoded in the pipeline that you should keep when editing:

1. **Never use hex codes in image prompts** — image models render them as
   literal floating text. Plain English only ("vivid neon lime green").
   Hex values in `brand.render` are fine; they're only used by Remotion.
2. **Never describe text or letters in scene compositions.**
3. Every image prompt ends with:
   `CRITICAL: absolutely zero text, numbers, hex codes, or letters anywhere in this image.`

## Output layout

```
output/2026-07-06/
├── your-article-slug.mp4
└── your-article-slug-post-package.txt
temp/        # per-job working images (auto-cleared on success)
logs/
└── video-history.json
```

## Known failure modes (already handled)

| Symptom | Cause | Fix in this repo |
|---|---|---|
| Floating colored text in images | Hex codes in prompts | Plain-English colors + no-text rule (`visual-types.ts`) |
| `Expected ',' or ']'` JSON errors | Token limit truncation | `maxOutputTokens: 8192` + `responseMimeType` |
| Black video frames | `file://` paths in Remotion | `scenesToDataURIs()` before `renderMedia()` |
| Process killed after render | 1,800 stdout writes from `onProgress` | Throttled to ≥5% + `logLevel: 'error'` |
| Imagen safety filter error | Passing `safetyFilterLevel` | Parameter omitted entirely |
| Paragraphs vanishing from articles | Keyword-based CTA stripping | Only the trailing 3-paragraph block is inspected |
