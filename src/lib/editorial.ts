import { createHash, randomUUID } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import * as cheerio from 'cheerio';
import type { State, Story, Facts, Content, Edition, Portal } from './schema';
import { sanitizeText, safeGet } from './security';
export function canonicalUrl(raw: string) {
  const u = new URL(raw);
  u.hash = '';
  for (const k of [...u.searchParams.keys()])
    if (k.startsWith('utm_') || ['fbclid', 'gclid'].includes(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  return u.href.replace(/\/$/, '');
}
export function fingerprint(text: string) {
  return createHash('sha256')
    .update(
      text
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, '')
    )
    .digest('hex');
}
export function similarity(a: string, b: string) {
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .normalize('NFKC')
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length > 2)
    );
  const x = tokens(a),
    y = tokens(b);
  const union = new Set([...x, ...y]);
  return union.size ? [...x].filter((t) => y.has(t)).length / union.size : 0;
}
export function verification(facts: Facts) {
  if (facts.claims.some((c) => c.status === 'Conflicting Sources')) return 'Conflicting Sources';
  if (facts.highRisk && !facts.riskApproved) return 'Needs Editorial Review';
  if (facts.claims.length && facts.claims.every((c) => c.status === 'Verified')) return 'Verified';
  if (facts.claims.some((c) => c.status === 'Verified' || c.status === 'Partially Verified'))
    return 'Partially Verified';
  return 'Unverified';
}
export function checkLock(facts: Facts) {
  if (!facts.claims.length) throw new Error('Add at least one factual claim.');
  if (facts.highRisk && !facts.riskApproved)
    throw new Error('High-risk content requires explicit editor approval.');
  for (const c of facts.claims) {
    if (c.type === 'inference') throw new Error('Inferences cannot be authoritative locked facts.');
    if (!c.evidence.length) throw new Error('Every locked claim requires a source.');
    if (c.status === 'Verified') {
      const origins = new Set(
        c.evidence
          .filter((e) => e.retrievedAt && e.excerpt.trim())
          .map((e) => e.origin.trim().toLowerCase())
          .filter(Boolean)
      );
      if (
        origins.size < 2 ||
        new Set(
          c.evidence
            .filter((e) => e.retrievedAt && e.excerpt.trim())
            .map((e) => canonicalUrl(e.url))
        ).size < 2
      )
        throw new Error(
          'Verified claims require retrieved evidence from at least two independent origins.'
        );
    }
    if (c.status === 'Conflicting Sources')
      throw new Error('Resolve conflicting claims before locking.');
  }
}
export function validateContent(content: Content, facts: Facts) {
  const locked = facts.claims
    .map((c) => c.text + ' ' + c.evidence.map((e) => e.excerpt).join(' '))
    .join(' ');
  const generated = [
    ...content.headlinesBn,
    content.headlineEn,
    content.alternateEn,
    content.articleEn,
    content.articleBn,
    content.caption,
    content.summaryEn,
    content.summaryBn,
    content.seo.title,
    content.seo.description,
  ].join(' ');
  const normalize = (s: string) => s.replace(/[০-৯]/g, (c) => String('০১২৩৪৫৬৭৮৯'.indexOf(c)));
  const allowed = new Set(normalize(locked).match(/\d+(?:[.,:/-]\d+)*/g) || []);
  const flags: string[] = [];
  for (const n of new Set(normalize(generated).match(/\d+(?:[.,:/-]\d+)*/g) || []))
    if (!allowed.has(n)) flags.push(`Number/date absent from fact lock: ${n}`);
  for (const q of generated.matchAll(/[“"]([^”"\n]{3,})[”"]/g))
    if (!locked.includes(q[1])) flags.push(`Quote absent from fact lock: ${q[1]}`);
  const evidenceUrls = new Set(
    facts.claims.flatMap((c) => c.evidence.map((e) => canonicalUrl(e.url)))
  );
  for (const url of content.sourceUrls)
    if (!evidenceUrls.has(canonicalUrl(url)))
      flags.push('Generated source URL is absent from the fact lock.');
  // Named entities cannot be proven by token heuristics across languages. Always retain an explicit editorial review gate.
  return [...new Set(flags)];
}
export function invalidate(state: State, storyId: string) {
  for (const e of state.editions.filter((e) => e.storyId === storyId)) {
    if (e.status === 'Publishing')
      throw new Error('Cannot change facts while publication is in progress.');
    if (e.status === 'Published') continue;
    e.status = 'Awaiting Review';
    e.approvedAt = null;
    e.approvedBy = null;
    e.flags = ['Facts changed: regenerate or review this edition.'];
    e.designAssetId = null;
    for (const p of state.publications.filter(
      (p) => p.editionId === e.id && p.status === 'Scheduled'
    )) {
      p.status = 'Failed';
      const j = state.jobs.find((j) => j.id === p.jobId);
      if (j) {
        j.status = 'cancelled';
        j.message = 'Fact lock changed.';
      }
    }
  }
}
export function parseFeed(xml: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML entity declarations are not allowed.');
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    processEntities: false,
  }).parse(xml);
  const raw = parsed.rss?.channel?.item ?? parsed.feed?.entry ?? [];
  return (Array.isArray(raw) ? raw : [raw])
    .map((item: Record<string, unknown>) => {
      const value = (x: unknown): string =>
        typeof x === 'string'
          ? x
          : typeof x === 'number'
            ? String(x)
            : x && typeof x === 'object'
              ? value((x as Record<string, unknown>)['#text'])
              : '';
      const links = Array.isArray(item.link) ? item.link : [item.link];
      const link = links.find(
        (l) =>
          typeof l === 'string' ||
          (l && typeof l === 'object' && (!l['@_rel'] || l['@_rel'] === 'alternate'))
      );
      const url = typeof link === 'string' ? link : value(link?.['@_href']);
      return {
        title: sanitizeText(value(item.title)),
        url,
        body: sanitizeText(
          value(item['content:encoded'] || item.content || item.description || item.summary)
        ).slice(0, 100000),
        publishedAt: value(item.pubDate || item.published || item.updated),
        author: value(item['dc:creator'] || item.author),
        image: null,
      };
    })
    .filter((i) => i.title && /^https:\/\//.test(i.url));
}
export async function discoverFeeds(raw: string) {
  const page = await safeGet(raw);
  const $ = cheerio.load(page.body);
  const candidates = $('link[rel="alternate"]')
    .toArray()
    .filter((e) => /rss|atom|xml/i.test($(e).attr('type') || ''))
    .map((e) => new URL($(e).attr('href') || '', page.url).href);
  const found: { url: string; items: number }[] = [];
  for (const candidate of candidates.slice(0, 5)) {
    try {
      const feed = await safeGet(candidate);
      const items = parseFeed(feed.body);
      if (items.length) found.push({ url: candidate, items: items.length });
    } catch {
      /* Invalid feeds remain unregistered. */
    }
  }
  return found;
}
export function ingest(
  state: State,
  source: State['sources'][number],
  item: {
    title: string;
    url: string;
    body: string;
    publishedAt?: string;
    author?: string;
    image?: string | null;
  },
  manual = false
) {
  const url = canonicalUrl(item.url);
  if (state.sourceItems.some((i) => canonicalUrl(i.url) === url)) return null;
  if (state.stories.some((s) => canonicalUrl(s.url) === url)) return null;
  const related = state.stories.find(
    (s) =>
      fingerprint(s.title) === fingerprint(item.title) ||
      s.fingerprint === fingerprint(item.body || item.title) ||
      similarity(s.title, item.title) > 0.65
  );
  if (related) {
    state.sourceItems.push({
      id: randomUUID(),
      storyId: related.id,
      sourceId: source.id,
      url,
      title: item.title,
      body: item.body,
      publishedAt:
        item.publishedAt && !isNaN(new Date(item.publishedAt).getTime())
          ? new Date(item.publishedAt).toISOString()
          : null,
    });
    if (!related.relatedUrls.includes(url)) related.relatedUrls.push(url);
    return related;
  }
  const parsed = item.publishedAt ? new Date(item.publishedAt) : null;
  const date = parsed && !isNaN(parsed.getTime()) ? parsed.toISOString() : null;
  const age = date ? (Date.now() - new Date(date).getTime()) / 3600000 : null;
  const story: Story = {
    id: randomUUID(),
    title: item.title,
    url,
    publisher: source.name,
    sourceId: source.id,
    language: source.language,
    category: source.category,
    publishedAt: date,
    discoveredAt: new Date().toISOString(),
    body: item.body,
    summary: item.body.slice(0, 240),
    image: item.image || null,
    author: item.author || null,
    fingerprint: fingerprint(item.body || item.title),
    clusterId: randomUUID(),
    relatedUrls: [],
    score: age === null ? 30 : Math.max(10, Math.min(70, 70 - age)),
    rationale: [
      age === null
        ? 'Publication time unknown'
        : `Recency signal: ${Math.max(0, age).toFixed(1)} hours old`,
      'Editorial interest estimate; not objective trending',
      'Source priority affects fetch order, not factual confidence',
    ],
    extractionConfidence: manual ? 'manual' : 'feed',
    selected: false,
    facts: {
      version: 1,
      claims: [],
      locked: false,
      lockedAt: null,
      lockedBy: null,
      highRisk: false,
      riskApproved: false,
      notes: '',
    },
  };
  state.stories.unshift(story);
  state.sourceItems.push({
    id: randomUUID(),
    storyId: story.id,
    sourceId: source.id,
    url,
    title: item.title,
    body: item.body,
    publishedAt: date,
  });
  return story;
}
export function manualContent(story: Story, portal: Portal): Content {
  const text = story.facts.claims.map((c) => c.text).join('\n\n');
  const urls = [...new Set(story.facts.claims.flatMap((c) => c.evidence.map((e) => e.url)))];
  return {
    headlinesBn: [
      story.language === 'bn' ? story.title : 'সম্পাদককে বাংলা শিরোনাম লিখতে হবে',
      story.language === 'bn' ? story.title : 'বাংলা বিকল্প শিরোনাম লিখুন',
    ],
    headlineEn: story.language === 'en' ? story.title : 'Editor: add an English headline',
    alternateEn: '',
    articleEn: story.language === 'en' ? text : 'Editor: translate locked facts into English.',
    articleBn:
      story.language === 'bn' ? text : 'সম্পাদক: অনুমোদিত তথ্য থেকে বাংলা প্রতিবেদন লিখুন।',
    summaryEn: '',
    summaryBn: '',
    caption: portal.language === story.language ? story.title : '',
    hashtags: portal.hashtags.slice(0, 5),
    imageKeywordsEn: [],
    imageKeywordsBn: [],
    seo: { title: story.title, description: '', slug: story.id },
    sourceUrls: urls,
  };
}
export function canApprove(edition: Edition, story: Story) {
  if (!story.facts.locked || edition.factVersion !== story.facts.version)
    throw new Error('A current fact lock is required.');
  if (edition.flags.length) throw new Error('Resolve consistency flags before approval.');
  if (story.facts.highRisk && !story.facts.riskApproved)
    throw new Error('High-risk approval is missing.');
  const all = [
    edition.content.headlineEn,
    ...edition.content.headlinesBn,
    edition.content.articleEn,
    edition.content.articleBn,
  ].join(' ');
  if (/Editor:|সম্পাদক[:ক]|লিখতে হবে|লিখুন/.test(all))
    throw new Error('Complete both languages before approval.');
}
export function dhakaTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
export function dhakaToUtc(local: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error('Use a Dhaka date and time.');
  const d = new Date(`${local}:00+06:00`);
  if (
    isNaN(d.getTime()) ||
    new Date(d.getTime() + 6 * 3600000).toISOString().slice(0, 16) !== local
  )
    throw new Error('Invalid scheduled date.');
  return d.toISOString();
}

export function mergeRegeneration(original: Content, generated: Content, part: unknown): Content {
  if (part === 'all') return generated;
  if (part === 'headlines')
    return {
      ...original,
      headlinesBn: generated.headlinesBn,
      headlineEn: generated.headlineEn,
      alternateEn: generated.alternateEn,
    };
  if (part === 'articles')
    return {
      ...original,
      articleEn: generated.articleEn,
      articleBn: generated.articleBn,
      summaryEn: generated.summaryEn,
      summaryBn: generated.summaryBn,
    };
  if (part === 'caption')
    return { ...original, caption: generated.caption, hashtags: generated.hashtags };
  throw new Error('Unknown regeneration part.');
}
