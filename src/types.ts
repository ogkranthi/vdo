export type VideoStyle =
  | 'PUNCHY_CUTS'
  | 'STORY_ARC'
  | 'MYTH_BUSTER'
  | 'RAPID_FIRE'
  | 'DEEP_REVEAL'
  | 'LIST_FORMAT';

export const VIDEO_STYLES: VideoStyle[] = [
  'PUNCHY_CUTS',
  'STORY_ARC',
  'MYTH_BUSTER',
  'RAPID_FIRE',
  'DEEP_REVEAL',
  'LIST_FORMAT',
];

export type Platform = 'medium' | 'substack';

export interface Article {
  slug: string;
  title: string;
  platform: Platform;
  filePath: string;
  content: string;
}

export interface Scene {
  durationSeconds: number;
  caption: string;
  subCaption?: string;
  imagePrompt: string;
  visualType: string;
}

export interface VideoScript {
  hookStyle: string;
  videoStyle: VideoStyle;
  scenes: Scene[];
}

export interface SceneWithImage extends Scene {
  imagePath: string;
}

/** What the Remotion composition receives: images inlined as base64 data URIs. */
export interface RenderableScene extends Scene {
  imageDataUri: string;
}

export interface PostPackage {
  videoTitle: string;
  captionBody: string;
  captionHashtags: string[];
  firstCommentHashtags: string[];
  pinterestTitle: string;
  pinterestDescription: string;
}

export interface HistoryEntry {
  slug: string;
  title: string;
  date: string; // ISO date
  videoStyle: VideoStyle;
  hookStyle: string;
  outputPath: string;
}

export interface VideoHistory {
  totalVideos: number;
  entries: HistoryEntry[];
}

export interface PickedArticle {
  article: Article;
  /** True when the article was used before — tells the script generator to find a new angle. */
  freshAngle: boolean;
}

export interface CliOptions {
  daily: boolean;
  article?: string;
  style?: VideoStyle;
  scriptOnly: boolean;
  noRender: boolean;
  list: boolean;
}
