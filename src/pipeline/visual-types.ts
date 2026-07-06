import { Scene } from '../types';
import { BRAND, NO_TEXT_RULE } from '../brand';

/**
 * 20 visual types grouped by emotional register. The assignment algorithm
 * (not the LLM, and not a fixed rotation) decides which type each scene gets:
 *   - first scene: always a high-emotion HOOK type
 *   - last scene: always a PAYOFF type
 *   - middle scenes: rotate through registers, no two adjacent scenes
 *     share a type
 * Each prompt also gets a perspective layer (camera angle) and an atmosphere
 * layer (background treatment), so two videos using the same visual type
 * still look compositionally different.
 */

type Register = 'hook' | 'struggle' | 'insight' | 'action' | 'payoff';

interface VisualType {
  name: string;
  register: Register;
  description: string;
}

export const VISUAL_TYPES: VisualType[] = [
  // Hooks — high emotion, scroll-stopping
  { name: 'SOLO_REACTION', register: 'hook', description: 'a single character reacting with an exaggerated, raw emotion, face and body language doing all the work' },
  { name: 'COUNTDOWN_CLOCK', register: 'hook', description: 'a character in a tense race against an oversized abstract clock face with no numerals, urgency radiating from the pose' },
  { name: 'SPOTLIGHT_SOLO', register: 'hook', description: 'one character isolated in a harsh spotlight surrounded by darkness, dramatic and confessional' },
  { name: 'MEME_ROCKBOTTOM', register: 'hook', description: 'a character comically flattened at absolute rock bottom, deadpan despair played for dark humor' },

  // Struggle — tension, frustration, being stuck
  { name: 'TANGLED_MESS', register: 'struggle', description: 'a character hopelessly tangled in a chaotic scribble of lines, wrestling to get free' },
  { name: 'WALL_CLIMB', register: 'struggle', description: 'a tiny character attempting to scale an impossibly tall smooth wall' },
  { name: 'HEAVY_BURDEN', register: 'struggle', description: 'a character straining under a comically oversized boulder carried on their back' },
  { name: 'MAZE_LOST', register: 'struggle', description: 'a character lost in the middle of a sprawling maze viewed at a dramatic angle' },
  { name: 'RAINCLOUD_FOLLOW', register: 'struggle', description: 'a character followed by a personal raincloud while everything around them stays dry' },

  // Insight — realization, contrast, the turn
  { name: 'LIGHTBULB_MOMENT', register: 'insight', description: 'a character struck by a glowing abstract idea-burst above their head, posture snapping upright' },
  { name: 'SPLIT_CONTRAST', register: 'insight', description: 'a frame split into two contrasting halves, the same character living both versions of the choice' },
  { name: 'DOOR_CRACK_LIGHT', register: 'insight', description: 'a character noticing a door cracked open with brilliant light pouring through the gap' },
  { name: 'ZOOM_DETAIL', register: 'insight', description: 'an extreme close-up on one small crucial object while everything else blurs away' },

  // Action — doing the thing, momentum
  { name: 'BLUEPRINT_BUILD', register: 'action', description: 'a character actively assembling large geometric blocks into a structure, mid-build energy' },
  { name: 'ARROW_PATH', register: 'action', description: 'a character striding along a bold winding arrow-shaped path toward the horizon' },
  { name: 'DOMINO_PUSH', register: 'action', description: 'a character tipping the first domino in a long curving chain of oversized dominoes' },
  { name: 'ROCKET_LAUNCH', register: 'action', description: 'a character riding or launching a small cartoon rocket, motion lines streaking behind' },

  // Payoff — resolution, triumph
  { name: 'CELEBRATION', register: 'payoff', description: 'a character mid-leap in pure triumph, confetti-like abstract shapes bursting around them' },
  { name: 'MOUNTAIN_SUMMIT', register: 'payoff', description: 'a character planting a flag on a mountain summit above the clouds, vast satisfying view' },
  { name: 'STAT_HERO', register: 'payoff', description: 'a character standing proudly on top of a rising abstract bar-chart-like staircase of blocks' },
];

const HOOK_TYPES = VISUAL_TYPES.filter((v) => v.register === 'hook');
const PAYOFF_TYPES = VISUAL_TYPES.filter((v) => v.register === 'payoff');
const MIDDLE_REGISTERS: Register[] = ['struggle', 'insight', 'action'];

export const PERSPECTIVES = [
  'straight-on eye-level shot',
  'dramatic low-angle looking up',
  'high overhead bird’s-eye view',
  'extreme close-up framing',
  'wide establishing shot with the character small in frame',
  'over-the-shoulder view',
  'dutch tilt at a slight diagonal',
  'profile side view like a stage play',
];

export const ATMOSPHERES = [
  'clean empty negative space around the subject',
  'a soft radial glow behind the subject',
  'subtle scattered geometric shapes floating in the background',
  'faint concentric rings radiating from the center',
  'a gentle gradient vignette darkening the edges',
  'sparse abstract star-like specks in the distance',
  'soft diagonal light beams crossing the frame',
  'a faint horizon line grounding the scene',
];

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

/**
 * Assigns visual types to scenes (hook first, payoff last, no adjacent
 * repeats in between) and layers perspective + atmosphere + brand style
 * onto every image prompt.
 */
export function applyVisualTreatment(scenes: Scene[], seed = 0): Scene[] {
  let lastType = '';
  let registerCursor = seed;

  return scenes.map((scene, i) => {
    let type: VisualType;
    if (i === 0) {
      type = pick(HOOK_TYPES, seed + i);
    } else if (i === scenes.length - 1) {
      type = pick(PAYOFF_TYPES, seed + i);
    } else {
      const register = MIDDLE_REGISTERS[registerCursor % MIDDLE_REGISTERS.length];
      registerCursor++;
      const candidates = VISUAL_TYPES.filter(
        (v) => v.register === register && v.name !== lastType,
      );
      type = pick(candidates, seed + i);
    }
    lastType = type.name;

    const perspective = pick(PERSPECTIVES, seed + i * 3);
    const atmosphere = pick(ATMOSPHERES, seed + i * 5);

    const imagePrompt = [
      BRAND.visualStyle,
      `Background: ${BRAND.background}. Accent elements in ${BRAND.accentColor}.`,
      `Scene: ${scene.imagePrompt}`,
      `Composition: ${type.description}.`,
      `Camera: ${perspective}.`,
      `Atmosphere: ${atmosphere}.`,
      NO_TEXT_RULE,
    ].join(' ');

    return { ...scene, visualType: type.name, imagePrompt };
  });
}
