import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { CliOptions, PickedArticle, VideoStyle, VIDEO_STYLES } from './types';
import { loadArticles, findArticle } from './pipeline/article-loader';
import { pickArticle } from './pipeline/article-picker';
import { generateScript } from './pipeline/script-generator';
import { generateImages } from './pipeline/image-generator';
import { renderVideo } from './pipeline/renderer';
import { generateMetadata, formatPostPackage } from './pipeline/metadata-generator';
import {
  loadHistory,
  recordVideo,
  daysSinceUsed,
  shouldPromoteGumroad,
} from './pipeline/history-tracker';

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    daily: false,
    scriptOnly: false,
    noRender: false,
    list: false,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--daily':
        options.daily = true;
        break;
      case '--article':
        options.article = argv[++i];
        break;
      case '--style': {
        const style = argv[++i] as VideoStyle;
        if (!VIDEO_STYLES.includes(style)) {
          throw new Error(`Unknown style "${style}". Options: ${VIDEO_STYLES.join(', ')}`);
        }
        options.style = style;
        break;
      }
      case '--script-only':
        options.scriptOnly = true;
        break;
      case '--no-render':
        options.noRender = true;
        break;
      case '--list':
        options.list = true;
        break;
      default:
        throw new Error(`Unknown flag "${argv[i]}". See README for usage.`);
    }
  }
  return options;
}

function listArticles(): void {
  const history = loadHistory();
  const articles = loadArticles();
  console.log(`\n${articles.length} article(s) available:\n`);
  for (const a of articles) {
    const age = daysSinceUsed(a.slug, history);
    const status =
      age === Infinity ? 'never used' : age > 14 ? `rested (${Math.floor(age)}d ago)` : `used ${Math.floor(age)}d ago`;
    console.log(`  [${a.platform.padEnd(8)}] ${a.title}  —  ${status}`);
  }
  console.log('');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.list) {
    listArticles();
    return;
  }

  if (!options.daily && !options.article) {
    console.log(`Usage:
  npm run create -- --daily                       auto-pick the next article
  npm run create -- --article "Title or slug"     use a specific article
  npm run create -- --daily --style MYTH_BUSTER   force a video style
  npm run create -- --daily --script-only         print the script, no images/render
  npm run create -- --daily --no-render           generate images only, skip render
  npm run create -- --list                        list available articles`);
    return;
  }

  // ── Stage 1: pick the article ────────────────────────────────────────
  const picked: PickedArticle = options.article
    ? { article: findArticle(options.article), freshAngle: daysSinceUsed(findArticle(options.article).slug) !== Infinity }
    : pickArticle();
  const { article, freshAngle } = picked;
  console.log(`\n[1/7] Article: "${article.title}" (${article.platform})${freshAngle ? ' — fresh angle' : ''}`);

  // ── Stage 2: generate the script ─────────────────────────────────────
  console.log('[2/7] Generating script...');
  const script = await generateScript(article, { freshAngle, forceStyle: options.style });
  const totalSeconds = script.scenes.reduce((s, sc) => s + sc.durationSeconds, 0);
  console.log(`      style=${script.videoStyle} hook=${script.hookStyle} scenes=${script.scenes.length} duration=${totalSeconds}s`);

  if (options.scriptOnly) {
    console.log('\n[script-only] Full script:\n');
    console.log(JSON.stringify(script, null, 2));
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  const jobId = `${date}-${article.slug}`;
  const outputDir = path.resolve('output', date);
  const videoPath = path.join(outputDir, `${article.slug}.mp4`);
  const packagePath = path.join(outputDir, `${article.slug}-post-package.txt`);

  // ── Stage 3: generate images ─────────────────────────────────────────
  console.log('[3/7] Generating images...');
  const scenesWithImages = await generateImages(script.scenes, jobId, console.log);

  if (options.noRender) {
    console.log(`\n[no-render] ${scenesWithImages.length} images saved in temp/${jobId}/`);
    return;
  }

  // ── Stage 4: render the video ────────────────────────────────────────
  console.log('[4/7] Rendering video...');
  await renderVideo(scenesWithImages, videoPath, console.log);
  console.log(`      saved ${path.relative(process.cwd(), videoPath)}`);

  // ── Stage 5: generate the post package ───────────────────────────────
  console.log('[5/7] Writing post package...');
  const promote = shouldPromoteGumroad();
  const pkg = await generateMetadata(article, script, promote);
  fs.writeFileSync(packagePath, formatPostPackage(pkg));
  console.log(`      saved ${path.relative(process.cwd(), packagePath)}${promote ? ' (includes product mention)' : ''}`);

  // ── Stage 6: log history ─────────────────────────────────────────────
  console.log('[6/7] Updating history...');
  recordVideo({
    slug: article.slug,
    title: article.title,
    date: new Date().toISOString(),
    videoStyle: script.videoStyle,
    hookStyle: script.hookStyle,
    outputPath: videoPath,
  });

  // ── Stage 7: clean up working images ─────────────────────────────────
  console.log('[7/7] Cleaning temp files...');
  fs.rmSync(path.resolve('temp', jobId), { recursive: true, force: true });

  console.log(`\nDone. Two files ready to upload:\n  ${videoPath}\n  ${packagePath}\n`);
}

main().catch((err) => {
  console.error(`\nPipeline failed: ${(err as Error).message}`);
  process.exit(1);
});
