import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import https from 'node:https';
import ipaddr from 'ipaddr.js';
export function isPublicAddress(address: string) {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === 'unicast';
  } catch {
    return false;
  }
}
export function validateUrlShape(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))
    throw new Error('Only public HTTPS URLs on port 443 are allowed.');
  if (url.hostname === 'localhost' || url.hostname.endsWith('.local'))
    throw new Error('Private destinations are blocked.');
  const literal = url.hostname.replace(/^\[|\]$/g, '');
  if (ipaddr.isValid(literal) && !isPublicAddress(literal))
    throw new Error('Private destinations are blocked.');
  return url;
}
export async function validatePublicUrl(raw: string) {
  const url = validateUrlShape(raw);
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new Error('Private or reserved destinations are blocked.');
  return { url, addresses };
}
export async function safeGet(
  raw: string,
  redirects = 0
): Promise<{ body: string; url: string; type: string }> {
  if (redirects > 4) throw new Error('Too many redirects.');
  const shape = validateUrlShape(raw);
  const trusted = (process.env.SOURCE_PROXY_TRUSTED_HOSTS || '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  if (
    process.env.NODE_USE_ENV_PROXY === '1' &&
    (process.env.HTTPS_PROXY || process.env.https_proxy) &&
    trusted.includes(shape.hostname)
  ) {
    // Explicit admin-reviewed hosts only. The trusted egress proxy resolves DNS; arbitrary
    // source domains continue to require local public DNS validation and destination pinning.
    const response = await fetch(shape, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Newsroom/0.1 (+permitted editorial feed ingestion)' },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect lacks a destination.');
      const next = validateUrlShape(new URL(location, shape).href);
      if (!trusted.includes(next.hostname))
        throw new Error(
          'Review the redirected host in SOURCE_PROXY_TRUSTED_HOSTS before proxy retrieval.'
        );
      return safeGet(next.href, redirects + 1);
    }
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Source returned no content.');
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 2_000_000) {
        await reader.cancel();
        throw new Error('Source exceeds 2 MB limit.');
      }
      chunks.push(value);
    }
    return {
      url: shape.href,
      body: Buffer.concat(chunks).toString('utf8'),
      type: response.headers.get('content-type') || '',
    };
  }
  const { url, addresses } = await validatePublicUrl(raw);
  const response = await new Promise<{
    status: number;
    location?: string;
    body: string;
    type: string;
  }>((resolve, reject) => {
    const req = https.get(
      url,
      {
        family: addresses[0].family,
        headers: {
          'User-Agent': 'Newsroom/0.1 (+permitted editorial feed ingestion)',
          Accept: 'text/html, application/rss+xml, application/atom+xml, application/xml, text/xml',
        },
        lookup: (_host, _options, callback) =>
          callback(null, addresses[0].address, addresses[0].family),
      },
      (res) => {
        let bytes = 0;
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 2_000_000) {
            req.destroy(new Error('Source exceeds 2 MB limit.'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode || 500,
            location: res.headers.location,
            body: Buffer.concat(chunks).toString('utf8'),
            type: String(res.headers['content-type'] || ''),
          })
        );
        res.on('error', reject);
      }
    );
    req.setTimeout(15000, () => req.destroy(new Error('Source request timed out.')));
    req.on('error', reject);
  });
  if (response.status >= 300 && response.status < 400 && response.location)
    return safeGet(new URL(response.location, url).href, redirects + 1);
  if (response.status < 200 || response.status >= 300)
    throw new Error(`Source returned HTTP ${response.status}.`);
  return { body: response.body, url: url.href, type: response.type };
}
function key() {
  const value = process.env.ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value))
    throw new Error('ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters.');
  return Buffer.from(value, 'hex');
}
export function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((x) => x.toString('base64url')).join('.');
}
export function decrypt(value: string) {
  const [iv, tag, data] = value.split('.').map((x) => Buffer.from(x, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', key(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
}
export function sanitizeText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
