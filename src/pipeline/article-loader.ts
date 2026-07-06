import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { Article, Platform } from '../types';

const ARTICLES_DIR = process.env.ARTICLES_DIR || 'articles';

/**
 * Strips the trailing CTA block from an article.
 *
 * Lesson learned the hard way: matching on individual keywords like
 * "subscribe" anywhere in the article deletes real paragraphs that use the
 * word in passing. Instead we only look at the LAST few paragraphs and drop
 * a trailing run of them that look like CTA boilerplate.
 */
export function stripTrailingCta(content: string): string {
  const paragraphs = content.split(/\n\s*\n/);
  const ctaPattern =
    /\b(subscribe|follow me|join the newsletter|grab the|check out my|dm me|comment below|link in bio|upgrade to premium)\b/i;

  let cut = paragraphs.length;
  // Only ever consider the final three paragraphs — the CTA block structure.
  const floor = Math.max(0, paragraphs.length - 3);
  for (let i = paragraphs.length - 1; i >= floor; i--) {
    if (ctaPattern.test(paragraphs[i])) {
      cut = i;
    } else {
      break;
    }
  }
  return paragraphs.slice(0, cut).join('\n\n').trim();
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.(md|txt|markdown)$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function titleFrom(data: Record<string, unknown>, body: string, fileName: string): string {
  if (typeof data.title === 'string' && data.title.trim()) return data.title.trim();
  const heading = body.match(/^#\s+(.+)$/m);
  if (heading) return heading[1].trim();
  return fileName.replace(/\.(md|txt|markdown)$/i, '');
}

function platformFrom(data: Record<string, unknown>): Platform {
  const p = String(data.platform || '').toLowerCase();
  return p === 'substack' ? 'substack' : 'medium';
}

export function loadArticles(dir: string = ARTICLES_DIR): Article[] {
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs)) {
    throw new Error(
      `Articles directory not found: ${abs}. Create it and drop in .md or .txt files.`,
    );
  }
  const files = fs
    .readdirSync(abs)
    .filter((f) => /\.(md|txt|markdown)$/i.test(f))
    .sort();

  return files.map((file) => {
    const raw = fs.readFileSync(path.join(abs, file), 'utf-8');
    const { data, content } = matter(raw);
    return {
      slug: slugify(file),
      title: titleFrom(data, content, file),
      platform: platformFrom(data),
      filePath: path.join(abs, file),
      content: stripTrailingCta(content),
    };
  });
}

/** Find one article by slug or (case-insensitive, partial) title. */
export function findArticle(query: string, dir?: string): Article {
  const articles = loadArticles(dir);
  const q = query.toLowerCase();
  const found =
    articles.find((a) => a.slug === slugify(query)) ||
    articles.find((a) => a.title.toLowerCase() === q) ||
    articles.find((a) => a.title.toLowerCase().includes(q)) ||
    articles.find((a) => a.slug.includes(slugify(query)));
  if (!found) {
    const available = articles.map((a) => `  - ${a.title} (${a.slug})`).join('\n');
    throw new Error(`No article matching "${query}". Available:\n${available}`);
  }
  return found;
}
