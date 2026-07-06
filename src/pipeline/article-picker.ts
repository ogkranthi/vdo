import { Article, PickedArticle } from '../types';
import { loadArticles } from './article-loader';
import { loadHistory, daysSinceUsed } from './history-tracker';

const REST_DAYS = 14;
const MEDIUM_WEIGHT = 0.7; // 70% Medium / 30% Substack

/**
 * Strict priority order:
 *   1. never-used articles
 *   2. "rested" articles — used more than 14 days ago (freshAngle: true)
 *   3. recently used — last-resort fallback (freshAngle: true)
 * Within a tier, Medium articles get first pick 70% of the time because
 * short-form video drives more referral traffic back to Medium.
 */
export function pickArticle(dir?: string): PickedArticle {
  const articles = loadArticles(dir);
  if (articles.length === 0) {
    throw new Error('No articles found. Drop .md or .txt files into the articles folder.');
  }

  const history = loadHistory();
  const age = (a: Article) => daysSinceUsed(a.slug, history);

  const neverUsed = articles.filter((a) => age(a) === Infinity);
  const rested = articles.filter((a) => age(a) !== Infinity && age(a) > REST_DAYS);
  const recent = articles.filter((a) => age(a) <= REST_DAYS);

  if (neverUsed.length > 0) {
    return { article: weightedPick(neverUsed), freshAngle: false };
  }
  if (rested.length > 0) {
    // Longest-rested first so one article can become several videos over months.
    const sorted = [...rested].sort((a, b) => age(b) - age(a));
    return { article: platformPreferred(sorted), freshAngle: true };
  }
  const sorted = [...recent].sort((a, b) => age(b) - age(a));
  return { article: sorted[0], freshAngle: true };
}

function weightedPick(candidates: Article[]): Article {
  const medium = candidates.filter((a) => a.platform === 'medium');
  const substack = candidates.filter((a) => a.platform === 'substack');
  if (medium.length === 0) return substack[0];
  if (substack.length === 0) return medium[0];
  // Deterministic weighting keyed off history size — no Math.random so runs
  // are reproducible: 7 of every 10 picks go to Medium.
  const tick = loadHistory().totalVideos;
  return tick % 10 < MEDIUM_WEIGHT * 10 ? medium[0] : substack[0];
}

function platformPreferred(sorted: Article[]): Article {
  const medium = sorted.find((a) => a.platform === 'medium');
  return medium ?? sorted[0];
}
