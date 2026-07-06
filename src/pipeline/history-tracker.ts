import fs from 'fs';
import path from 'path';
import { HistoryEntry, VideoHistory } from '../types';

const HISTORY_PATH = path.resolve('logs', 'video-history.json');

export function loadHistory(): VideoHistory {
  if (!fs.existsSync(HISTORY_PATH)) {
    return { totalVideos: 0, entries: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8')) as VideoHistory;
  } catch {
    return { totalVideos: 0, entries: [] };
  }
}

export function recordVideo(entry: HistoryEntry): VideoHistory {
  const history = loadHistory();
  history.entries.push(entry);
  history.totalVideos = history.entries.length;
  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  return history;
}

/** Days since this article was last turned into a video; Infinity if never. */
export function daysSinceUsed(slug: string, history = loadHistory()): number {
  const used = history.entries.filter((e) => e.slug === slug);
  if (used.length === 0) return Infinity;
  const last = used[used.length - 1].date;
  return (Date.now() - new Date(last).getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Cadence logic: every 5th video mentions the product in the caption.
 * Called BEFORE recording the new video, so the video being made now is
 * number totalVideos + 1.
 */
export function shouldPromoteGumroad(history = loadHistory()): boolean {
  const videoNumber = history.totalVideos + 1;
  return videoNumber % 5 === 0;
}
