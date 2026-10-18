import { describe, it, expect } from 'vitest';
import {
  canonicalUrl,
  fingerprint,
  similarity,
  parseFeed,
  ingest,
  checkLock,
  verification,
  validateContent,
  canApprove,
  invalidate,
  dhakaToUtc,
} from '../src/lib/editorial';
import { fitText, svgCard } from '../src/lib/design';
import { sourceSchema, stateSchema } from '../src/lib/schema';
import { seed } from '../src/lib/seed';
import { fixture } from './fixtures';

describe('source ingestion and clustering', () => {
  it('strips trackers and normalizes canonical URLs', () =>
    expect(canonicalUrl('https://example.com/a/?utm_source=x&b=2&a=1#part')).toBe(
      'https://example.com/a/?a=1&b=2'
    ));
  it('fingerprints normalized bilingual headlines', () =>
    expect(fingerprint('ঢাকা: খবর!')).toBe(fingerprint('ঢাকা খবর')));
  it('detects token overlap without claiming semantic proof', () => {
    expect(
      similarity('campus library reading room opens', 'campus library reading room opens today')
    ).toBeGreaterThan(0.65);
    expect(similarity('football result', 'library reading room')).toBe(0);
  });
  it('parses RSS attribution and strips markup', () => {
    const entries = parseFeed(
      '<rss><channel><item><title>Library opens</title><link>https://example.com/a</link><description><![CDATA[<p>Source text</p>]]></description><pubDate>Sun, 18 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>'
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].body).toBe('Source text');
  });
  it('parses Atom alternate links', () =>
    expect(
      parseFeed(
        '<feed><entry><title>News</title><link rel="alternate" href="https://example.com/news"/><summary>Facts</summary></entry></feed>'
      )[0].url
    ).toBe('https://example.com/news'));
  it('rejects XML entity declarations', () =>
    expect(() => parseFeed('<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><rss/>')).toThrow(
      'entity'
    ));
  it('ignores malformed or missing links', () =>
    expect(parseFeed('<rss><channel><item><title>News</title></item></channel></rss>')).toEqual(
      []
    ));
  it('deduplicates canonical URLs and normalized headlines', () => {
    const { state, story } = fixture();
    const count = state.stories.length;
    expect(
      ingest(state, state.sources[0], {
        title: story.title,
        url: story.url + '?utm_source=x',
        body: story.body,
      })
    ).toBeNull();
    expect(state.stories).toHaveLength(count);
  });
  it('retains original reports for heuristic event clusters', () => {
    const { state, story } = fixture();
    ingest(state, state.sources[1], {
      title: story.title + ' today',
      url: 'https://example.org/reading',
      body: 'An independently imported source report.',
    });
    expect(state.stories).toHaveLength(1);
    expect(story.relatedUrls).toContain('https://example.org/reading');
    expect(state.sourceItems).toHaveLength(2);
    expect(story.facts.claims[0].evidence).toHaveLength(1);
  });
  it('never invents unknown publication dates', () => {
    const state = seed();
    const story = ingest(state, state.sources[0], {
      title: 'A different story',
      url: 'https://example.com/different',
      body: 'Original text',
    });
    expect(story?.publishedAt).toBeNull();
  });
  it('seeds no invented feed URLs or confirmed Facebook identities', () => {
    const state = seed();
    expect(state.sources.every((s) => !s.enabled)).toBe(true);
    expect(
      state.sources
        .filter((s) => s.sourceType === 'facebook')
        .every((s) => s.url === '' && s.status === 'Awaiting URL Confirmation')
    ).toBe(true);
    expect(state.templates).toHaveLength(0);
    expect(stateSchema.safeParse(state).success).toBe(true);
  });
  it('validates source limits', () =>
    expect(sourceSchema.safeParse({ ...seed().sources[0], maxStories: 1000 }).success).toBe(false));
});
describe('evidence, locks, and approvals', () => {
  it('locks attributed but explicitly unverified facts', () =>
    expect(() => checkLock(fixture().facts)).not.toThrow());
  it('requires a factual claim', () => {
    const { facts } = fixture();
    facts.claims = [];
    expect(() => checkLock(facts)).toThrow('claim');
  });
  it('rejects inference as authoritative evidence', () => {
    const { facts } = fixture();
    facts.claims[0].type = 'inference';
    expect(() => checkLock(facts)).toThrow('Inferences');
  });
  it('requires explicit high-risk approval', () => {
    const { facts } = fixture();
    facts.highRisk = true;
    expect(() => checkLock(facts)).toThrow('High-risk');
    facts.riskApproved = true;
    expect(() => checkLock(facts)).not.toThrow();
  });
  it('does not count republished wire copies as independent corroboration', () => {
    const { facts } = fixture();
    const c = facts.claims[0];
    c.status = 'Verified';
    c.evidence = [
      { ...c.evidence[0], origin: 'same wire', retrievedAt: new Date().toISOString() },
      {
        ...c.evidence[0],
        publisher: 'Other publisher',
        origin: 'same wire',
        retrievedAt: new Date().toISOString(),
      },
    ];
    expect(() => checkLock(facts)).toThrow('independent');
  });
  it('accepts retrieved independent origins as an editor assertion, not automatic proof', () => {
    const { facts } = fixture();
    const c = facts.claims[0];
    c.status = 'Verified';
    c.evidence = [
      { ...c.evidence[0], origin: 'primary record', retrievedAt: new Date().toISOString() },
      {
        ...c.evidence[0],
        url: 'https://example.org/report',
        origin: 'separate reporting',
        retrievedAt: new Date().toISOString(),
      },
    ];
    expect(() => checkLock(facts)).not.toThrow();
    expect(verification(facts)).toBe('Verified');
  });
  it('retains conflicting-source status', () => {
    const { facts } = fixture();
    facts.claims[0].status = 'Conflicting Sources';
    expect(verification(facts)).toBe('Conflicting Sources');
    expect(() => checkLock(facts)).toThrow('conflicting');
  });
  it('flags invented numbers, including Bangla digits', () => {
    const { facts, edition } = fixture();
    edition.content.articleBn += ' ৯৯৯ জন';
    expect(validateContent(edition.content, facts)).toContain(
      'Number/date absent from fact lock: 999'
    );
  });
  it('flags invented quotes', () => {
    const { facts, edition } = fixture();
    edition.content.articleEn += ' “Invented quotation”';
    expect(validateContent(edition.content, facts).some((f) => f.startsWith('Quote'))).toBe(true);
  });
  it('flags fabricated citations', () => {
    const { facts, edition } = fixture();
    edition.content.sourceUrls.push('https://example.net/false');
    expect(validateContent(edition.content, facts)).toContain(
      'Generated source URL is absent from the fact lock.'
    );
  });
  it('requires current lock version for approval', () => {
    const { story, edition } = fixture();
    edition.factVersion = 0;
    expect(() => canApprove(edition, story)).toThrow('current fact lock');
  });
  it('blocks incomplete manual translations', () => {
    const { story, edition } = fixture();
    edition.content.articleBn = 'সম্পাদক: অনুমোদিত তথ্য থেকে বাংলা প্রতিবেদন লিখুন।';
    expect(() => canApprove(edition, story)).toThrow('both languages');
  });
  it('invalidates article and graphic approvals on fact changes', () => {
    const { state, story, edition } = fixture();
    edition.status = 'Approved';
    edition.approvedAt = new Date().toISOString();
    invalidate(state, story.id);
    expect(edition.status).toBe('Awaiting Review');
    expect(edition.approvedAt).toBeNull();
    expect(edition.flags).toHaveLength(1);
  });
  it('does not change the factual record across portal styles', () => {
    const { state, story } = fixture();
    expect(state.portals[0].language).not.toBe(state.portals[1].language);
    const before = JSON.stringify(story.facts);
    validateContent(fixture().edition.content, story.facts);
    expect(JSON.stringify(story.facts)).toBe(before);
  });
});
describe('Bengali typography and scheduling', () => {
  it('fits Bengali headlines conservatively', () => {
    const fit = fitText('ক্যাম্পাস লাইব্রেরিতে নতুন পাঠকক্ষ চালু', 900, 5, 32);
    expect(fit.overflow).toBe(false);
    expect(fit.lines.length).toBeLessThanOrEqual(5);
  });
  it('rejects unbreakable overflow at minimum readable size', () =>
    expect(fitText('a'.repeat(1000), 500, 3, 32).overflow).toBe(true));
  it('escapes untrusted text in SVG', () => {
    const { svg } = svgCard({
      headline: '<script>news</script>',
      portalName: 'Brand',
      source: 'Source',
      color: '#2563eb',
      width: 1080,
      height: 1080,
      margin: 64,
      maxLines: 5,
      minFont: 32,
    });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });
  it('converts Dhaka scheduling to UTC without browser timezone', () =>
    expect(dhakaToUtc('2026-10-19T12:30')).toBe('2026-10-19T06:30:00.000Z'));
  it('rejects invalid date formats', () => expect(() => dhakaToUtc('tomorrow')).toThrow());
});

it('rejects impossible calendar dates instead of silently normalizing them', () =>
  expect(() => dhakaToUtc('2026-02-31T12:00')).toThrow('Invalid scheduled date'));
it('does not count two copies of one evidence URL as independent retrievals', () => {
  const { facts } = fixture();
  const c = facts.claims[0];
  c.status = 'Verified';
  c.evidence = [
    { ...c.evidence[0], origin: 'first claim of origin', retrievedAt: new Date().toISOString() },
    { ...c.evidence[0], origin: 'second claim of origin', retrievedAt: new Date().toISOString() },
  ];
  expect(() => checkLock(facts)).toThrow('independent');
});

it('upgrades older workspace documents without resetting saved stories', () => {
  const { state } = fixture();
  const legacy = {
    ...state,
    retrievedEvidence: undefined,
    sourceItems: undefined,
    factRevisions: undefined,
  };
  const upgraded = stateSchema.parse(legacy);
  expect(upgraded.stories[0].title).toBe(state.stories[0].title);
  expect(upgraded.retrievedEvidence).toEqual([]);
  expect(upgraded.sourceItems).toEqual([]);
  expect(upgraded.factRevisions).toEqual([]);
});
