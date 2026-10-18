import { XMLParser } from 'fast-xml-parser';
import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import { safeGet, sanitizeText } from './security';
import { parseFeed } from './editorial';
import type { State } from './schema';
export function parseSitemap(xml: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML entity declarations are not allowed.');
  const data = new XMLParser({ ignoreAttributes: false }).parse(xml);
  const urls = data.urlset?.url || [];
  return (Array.isArray(urls) ? urls : [urls])
    .map((entry: { loc?: unknown; lastmod?: unknown }) => ({
      url: String(entry.loc || ''),
      publishedAt: String(entry.lastmod || ''),
    }))
    .filter((e) => /^https:\/\//.test(e.url));
}
export function extractArticle(html: string, url: string) {
  const $ = cheerio.load(html);
  $('script,style,nav,footer,header,aside,form').remove();
  const title =
    $('meta[property="og:title"]').attr('content') || $('h1').first().text() || $('title').text();
  const article = $('article').first();
  const body = sanitizeText(article.length ? article.html() || '' : $('main').html() || '');
  if (!title.trim() || body.length < 80)
    throw new Error('No readable public article text was found. Use authorized manual import.');
  const image = $('meta[property="og:image"]').attr('content');
  return {
    title: sanitizeText(title),
    url,
    body: body.slice(0, 100000),
    publishedAt:
      $('meta[property="article:published_time"]').attr('content') ||
      $('time[datetime]').first().attr('datetime'),
    author: $('meta[name="author"]').attr('content'),
    image: image ? new URL(image, url).href : null,
  };
}
export async function permittedArticles(
  source: State['sources'][number],
  heartbeat: () => Promise<void>
) {
  if (source.ingestionPolicy !== 'public-extraction')
    throw new Error('Record permission for public extraction before enabling this source.');
  const origin = new URL(source.url).origin;
  const robots = await safeGet(`${origin}/robots.txt`);
  const policy = robotsParser(`${origin}/robots.txt`, robots.body);
  if (policy.isDisallowed(source.url, 'Newsroom/0.1'))
    throw new Error('robots.txt disallows this retrieval.');
  const delay = policy.getCrawlDelay('Newsroom/0.1') || 2;
  if (delay > 30)
    throw new Error(
      'Publisher crawl delay is too high for this worker. Use manual import or a permitted feed.'
    );
  const index = await safeGet(source.url);
  if (new URL(index.url).origin !== origin)
    throw new Error('Review a redirected publisher origin before crawling.');
  let urls: string[];
  if (source.sourceType === 'sitemap') urls = parseSitemap(index.body).map((e) => e.url);
  else {
    const $ = cheerio.load(index.body);
    urls = $('article a[href]')
      .toArray()
      .map((a) => new URL($(a).attr('href') || '', index.url).href);
    if (!urls.length) urls = [source.url];
  }
  const entries = [];
  for (const url of [...new Set(urls)]
    .filter((u) => new URL(u).origin === origin)
    .slice(0, source.maxStories)) {
    await heartbeat();
    if (policy.isDisallowed(url, 'Newsroom/0.1')) continue;
    await new Promise((r) => setTimeout(r, Math.max(2, delay) * 1000));
    try {
      const page = await safeGet(url);
      if (new URL(page.url).origin !== origin) continue;
      entries.push(extractArticle(page.body, page.url));
    } catch {
      /* An inaccessible article does not grant permission to bypass its controls. */
    }
  }
  if (!entries.length) throw new Error('No permitted readable articles were retrieved.');
  return entries;
}
export async function fetchSource(
  source: State['sources'][number],
  heartbeat: () => Promise<void>
) {
  if (['rss', 'atom'].includes(source.sourceType) && source.ingestionPolicy === 'feed') {
    const data = await safeGet(source.url);
    return parseFeed(data.body).slice(0, source.maxStories);
  }
  if (['website', 'sitemap'].includes(source.sourceType))
    return permittedArticles(source, heartbeat);
  throw new Error('Manual import required. No authorized adapter is configured for this source.');
}
