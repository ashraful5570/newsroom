import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseSitemap, extractArticle } from '../src/lib/extraction';
import { mergeRegeneration } from '../src/lib/editorial';
import { safeGet } from '../src/lib/security';
import { fixture } from './fixtures';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('permitted extraction and targeted generation', () => {
  it('parses news sitemap URLs without inventing endpoints', () =>
    expect(
      parseSitemap(
        '<urlset><url><loc>https://example.com/news</loc><lastmod>2026-10-18</lastmod></url></urlset>'
      )
    ).toEqual([{ url: 'https://example.com/news', publishedAt: '2026-10-18' }]));
  it('rejects sitemap XML entities', () =>
    expect(() => parseSitemap('<!DOCTYPE x><urlset/>')).toThrow('entity'));
  it('extracts source attribution metadata and public article text', () => {
    const article = extractArticle(
      '<html><head><meta property="og:title" content="An attributed story"><meta name="author" content="Reporter"><meta property="article:published_time" content="2026-10-18T12:00:00Z"></head><body><nav>Ignore navigation</nav><article><p>' +
        'Original attributed source text. '.repeat(5) +
        '</p><script>ignore()</script></article></body></html>',
      'https://example.com/news'
    );
    expect(article.title).toBe('An attributed story');
    expect(article.author).toBe('Reporter');
    expect(article.body).not.toContain('ignore()');
  });
  it('refuses to fabricate an article from inaccessible markup', () =>
    expect(() =>
      extractArticle('<html><h1>Login required</h1></html>', 'https://example.com')
    ).toThrow('No readable'));
  it('only changes selected fields during regeneration', () => {
    const { edition } = fixture();
    const next = {
      ...edition.content,
      headlineEn: 'A different wording',
      articleEn: 'Changed article',
      caption: 'New caption',
    };
    const merged = mergeRegeneration(edition.content, next, 'caption');
    expect(merged.caption).toBe('New caption');
    expect(merged.articleEn).toBe(edition.content.articleEn);
    expect(merged.headlineEn).toBe(edition.content.headlineEn);
  });
  it('uses a configured proxy only for exact admin-reviewed public hosts (mock transport)', async () => {
    vi.stubEnv('NODE_USE_ENV_PROXY', '1');
    vi.stubEnv('HTTPS_PROXY', 'http://proxy.invalid');
    vi.stubEnv('SOURCE_PROXY_TRUSTED_HOSTS', 'publisher.example');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('permitted source', { status: 200 }))
    );
    expect((await safeGet('https://publisher.example/feed')).body).toBe('permitted source');
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('rejects proxy redirects to unreviewed or private destinations (mock transport)', async () => {
    vi.stubEnv('NODE_USE_ENV_PROXY', '1');
    vi.stubEnv('HTTPS_PROXY', 'http://proxy.invalid');
    vi.stubEnv('SOURCE_PROXY_TRUSTED_HOSTS', 'publisher.example');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('', { status: 302, headers: { location: 'https://127.0.0.1/secrets' } })
        )
    );
    await expect(safeGet('https://publisher.example/feed')).rejects.toThrow('Private');
  });
});
