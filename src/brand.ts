/**
 * Brand guidelines — the single place your visual identity lives.
 *
 * Every image prompt and every rendered frame inherits from this object.
 * Edit the plain-English descriptions to rebrand the entire pipeline;
 * nothing downstream hardcodes a style.
 *
 * Rules that are NOT optional:
 *  - Colors inside image prompts are described in plain English only.
 *    Hex codes get rendered as literal floating text by image models.
 *  - Never describe text, letters, signs, or numbers in scene compositions.
 *  - Every image prompt ends with the NO_TEXT_RULE below.
 *
 * Hex values under `render` are fine — they are used by Remotion for
 * captions and accents, never sent to an image model.
 */
export const BRAND = {
  visualStyle:
    'Flork-style minimalist stick figures — simple, expressive, slightly chaotic energy. ' +
    'Every scene should feel like a comic panel.',
  background: 'deep solid black',
  accentColor: 'vivid neon lime green',
  textColor: 'bright white',
  watermark: '@TheSustainableSolopreneur',
  targetDuration: '50-60 seconds',
  minScenes: 9,
  maxScenes: 11,

  /** Used by Remotion for rendered UI only — never inside image prompts. */
  render: {
    background: '#000000',
    accent: '#7DC242',
    text: '#FFFFFF',
    watermarkOpacity: 0.4,
  },

  /** Mentioned in captions every 5th video (see history-tracker). */
  product: {
    name: 'the Substack Growth Engine',
    url: 'https://gumroad.com/your-product-link',
  },

  brandHashtags: [
    '#TheSustainableSolopreneur',
    '#stickfigure',
    '#solopreneur',
    '#newsletter',
  ],
} as const;

export const NO_TEXT_RULE =
  'CRITICAL: absolutely zero text, numbers, hex codes, or letters anywhere in this image.';
