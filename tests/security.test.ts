import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isPublicAddress,
  validatePublicUrl,
  encrypt,
  decrypt,
  sanitizeText,
} from '../src/lib/security';
import { checkOrigin, assertOwner, assertWrite } from '../src/lib/auth';
import {
  providerConfig,
  ManualPublisher,
  MetaDirectPublisher,
  BufferPublisher,
  remoteJson,
  estimatedCost,
} from '../src/lib/integrations';
import { retryDelay } from '../src/lib/worker';
import { publicState } from '../src/lib/store';
import { seed } from '../src/lib/seed';
afterEach(() => vi.unstubAllEnvs());
describe('security boundaries', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '169.254.169.254',
    '192.168.1.1',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    '0.0.0.0',
    '100.64.0.1',
  ])('blocks reserved destination %s', (address) => expect(isPublicAddress(address)).toBe(false));
  it('allows public addresses', () => expect(isPublicAddress('8.8.8.8')).toBe(true));
  it.each([
    'http://example.com',
    'https://user:pass@example.com',
    'https://example.com:444/',
    'https://localhost/',
  ])(
    'rejects unsafe URLs %s',
    async (url) => await expect(validatePublicUrl(url)).rejects.toThrow()
  );
  it('encrypts tokens and detects tampering', () => {
    vi.stubEnv('ENCRYPTION_KEY', 'ab'.repeat(32));
    const encrypted = encrypt('not-a-real-credential');
    expect(encrypted).not.toContain('not-a-real');
    expect(decrypt(encrypted)).toBe('not-a-real-credential');
    expect(() => decrypt(encrypted.slice(0, -3) + 'aaa')).toThrow();
  });
  it('requires a strong encryption key', () => {
    vi.stubEnv('ENCRYPTION_KEY', 'weak');
    expect(() => encrypt('x')).toThrow('32 bytes');
  });
  it('sanitizes scripts from external source text', () =>
    expect(sanitizeText('<script>steal()</script><p>News</p>')).toBe('News'));
  it('rejects cross-site mutation requests', () => {
    vi.stubEnv('APP_URL', 'https://newsroom.example.com');
    expect(() =>
      checkOrigin(
        new Request('https://newsroom.example.com/api/command', {
          method: 'POST',
          headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
        })
      )
    ).toThrow('origin');
  });
  it('prevents viewers from mutation and editors from owner settings', () => {
    const ctx = { workspaceId: 'test', actor: 'test', sandbox: false, role: 'viewer' as const };
    expect(() => assertWrite(ctx)).toThrow('editor');
    expect(() => assertOwner({ ...ctx, role: 'editor' })).toThrow('owner');
  });
  it('never exposes encrypted credentials to clients', () => {
    const state = seed();
    state.connections[0].tokenEncrypted = 'encrypted-secret';
    expect(JSON.stringify(publicState(state))).not.toContain('encrypted-secret');
  });
});
describe('truthful integration contracts', () => {
  it.each(['canva', 'meta', 'buffer'] as const)('gates unverified %s contracts', (p) => {
    vi.stubEnv(`${p.toUpperCase()}_DOCS_VERIFIED`, 'false');
    expect(() => providerConfig(p)).toThrow('not been verified');
  });
  it('rejects a configured non-provider host', () => {
    vi.stubEnv('CANVA_DOCS_VERIFIED', 'true');
    vi.stubEnv(
      'CANVA_API_CONFIG',
      JSON.stringify({ apiBase: 'https://attacker.example', profilePath: '/profile' })
    );
    expect(() => providerConfig('canva')).toThrow('allowlist');
  });
  it('manual publisher cannot invent publication success', async () =>
    await expect(new ManualPublisher().publish()).rejects.toThrow('Requires Manual Action'));
  it('Meta and Buffer remain disabled without verified contracts', async () => {
    await expect(new MetaDirectPublisher().publish()).rejects.toThrow();
    await expect(new BufferPublisher().publish()).rejects.toThrow();
  });
  it('models absent pricing as unknown rather than free', () => {
    vi.stubEnv('OPENAI_INPUT_USD_PER_MILLION', '');
    vi.stubEnv('OPENAI_OUTPUT_USD_PER_MILLION', '');
    expect(estimatedCost(100, 100)).toBeNull();
  });
  it('handles rate limits without fabricating success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"error":"rate limited"}', {
          status: 429,
          headers: { 'retry-after': '30' },
        })
      )
    );
    await expect(remoteJson('https://example.com', {}, 'mock-rate-limit')).rejects.toThrow('429');
    vi.unstubAllGlobals();
  });
  it('uses bounded exponential backoff with jitter', () => {
    expect(retryDelay(1, 0)).toBe(2000);
    expect(retryDelay(3, 0.5)).toBe(8500);
    expect(retryDelay(99, 0)).toBe(300000);
  });
});
