import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
export async function prepareFontCache() {
  process.env.XDG_CACHE_HOME ||= '/tmp/newsroom-font-cache';
  await mkdir(process.env.XDG_CACHE_HOME, { recursive: true, mode: 0o700 });
}
import { saveMedia, loadMedia } from './media-storage';
export { loadMedia } from './media-storage';
import { randomUUID } from 'node:crypto';
import type { State, Template, Edition } from './schema';
function escape(s: string) {
  return s.replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!
  );
}
export function fitText(
  text: string,
  width: number,
  maxLines: number,
  minFont: number,
  maxFont = 78
) {
  const words = text.trim().split(/\s+/);
  for (let size = maxFont; size >= minFont; size -= 2) {
    const lines: string[] = [];
    let line = '';
    let overflow = false;
    const measure = (v: string) =>
      [...v].reduce(
        (n, c) =>
          n +
          (c.charCodeAt(0) > 0x980 && c.charCodeAt(0) < 0xa00
            ? 0.72
            : /[MW@]/.test(c)
              ? 0.9
              : 0.57),
        0
      ) * size;
    for (const word of words) {
      if (measure(word) > width) {
        overflow = true;
        break;
      }
      if (measure(`${line} ${word}`.trim()) > width) {
        lines.push(line);
        line = word;
      } else line = `${line} ${word}`.trim();
    }
    if (line) lines.push(line);
    if (!overflow && lines.length <= maxLines) return { fontSize: size, lines, overflow: false };
  }
  return { fontSize: minFont, lines: [], overflow: true };
}
export function svgCard(input: {
  headline: string;
  portalName: string;
  color: string;
  source: string;
  width: number;
  height: number;
  margin: number;
  maxLines: number;
  minFont: number;
}) {
  const fitted = fitText(
    input.headline,
    input.width - input.margin * 2,
    input.maxLines,
    input.minFont,
    Math.min(84, input.width / 12)
  );
  if (fitted.overflow)
    throw new Error(
      'Headline cannot fit at the minimum readable size. Shorten it in the editor and recheck the facts.'
    );
  const lineHeight = fitted.fontSize * 1.45;
  const total = fitted.lines.length * lineHeight;
  const start = Math.max(input.height * 0.42, input.height - total - input.margin * 3);
  if (start + total > input.height - input.margin * 1.8)
    throw new Error('Headline exceeds vertical safe area. Reduce lines or shorten it.');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}"><rect width="100%" height="100%" fill="#111827"/><rect x="${input.margin}" y="${input.margin}" width="10" height="48" rx="5" fill="${escape(input.color)}"/><text x="${input.margin + 30}" y="${input.margin + 36}" fill="white" font-family="sans-serif" font-size="30" font-weight="700">${escape(input.portalName)}</text><rect x="${input.margin}" y="${input.height * 0.24}" width="${input.width - input.margin * 2}" height="3" fill="#334155"/>${fitted.lines.map((line, i) => `<text x="${input.margin}" y="${start + i * lineHeight}" fill="white" font-family="Noto Sans Bengali, sans-serif" font-size="${fitted.fontSize}" font-weight="700">${escape(line)}</text>`).join('')}<text x="${input.margin}" y="${input.height - input.margin}" fill="#94a3b8" font-family="sans-serif" font-size="20">${escape(input.source.slice(0, 70))}</text></svg>`;
  return {
    svg,
    diagnostics: [
      `Headline fitted to ${fitted.lines.length} lines at ${fitted.fontSize}px.`,
      'Conservative text-width estimate; inspect rendered Bangla shaping and overflow before approval.',
      'Built-in text graphic, not a natively editable Canva design.',
      'No documentary imagery is included.',
    ],
  };
}
export async function renderCard(state: State, edition: Edition, template: Template) {
  if (template.kind !== 'fallback')
    throw new Error(
      'Canva automation requires verified API capabilities. Select a built-in template or open the registered Canva design manually.'
    );
  const portal = state.portals.find((p) => p.id === edition.portalId)!;
  const story = state.stories.find((s) => s.id === edition.storyId)!;
  const headline =
    portal.language === 'bn' ? edition.content.headlinesBn[0] : edition.content.headlineEn;
  const result = svgCard({
    headline,
    portalName: portal.name,
    color: portal.color,
    source: story.publisher,
    width: template.width,
    height: template.height,
    margin: template.margin,
    maxLines: template.maxLines,
    minFont: template.minFont,
  });
  await prepareFontCache();
  let image = sharp(Buffer.from(result.svg));
  const photo = state.media.find((m) => m.id === edition.imageAssetId);
  if (photo) {
    if (
      !photo.rights.approved ||
      !photo.rights.license ||
      (photo.rights.expiresAt && new Date(photo.rights.expiresAt).getTime() <= Date.now())
    )
      throw new Error('Image rights require review or have expired.');
    const buffer = await loadMedia(photo.filename);
    const width = template.width - template.margin * 2,
      height = Math.floor(template.height * 0.18);
    const metadata = await sharp(buffer).metadata();
    const originalWidth = metadata.width!,
      originalHeight = metadata.height!;
    const scale = Math.max(width / originalWidth, height / originalHeight);
    const resizedWidth = Math.ceil(originalWidth * scale),
      resizedHeight = Math.ceil(originalHeight * scale);
    const crop = await sharp(buffer)
      .resize(resizedWidth, resizedHeight)
      .extract({
        left: Math.round((resizedWidth - width) * photo.focalX),
        top: Math.round((resizedHeight - height) * photo.focalY),
        width,
        height,
      })
      .png()
      .toBuffer();
    image = image.composite([
      { input: crop, left: template.margin, top: Math.floor(template.height * 0.19) },
    ]);
    result.diagnostics.push(
      'Approved image cropped by editor focal point; visually inspect subjects.'
    );
    if (photo.rights.illustration) {
      const label = Buffer.from(
        `<svg width="${width}" height="40"><rect width="100%" height="40" fill="#111827"/><text x="12" y="27" font-family="sans-serif" font-size="20" fill="white">AI-generated illustration</text></svg>`
      );
      image = image.composite([
        { input: crop, left: template.margin, top: Math.floor(template.height * 0.19) },
        { input: label, left: template.margin, top: Math.floor(template.height * 0.19) },
      ]);
    }
    result.diagnostics.push(`Image attribution: ${photo.rights.attribution}`);
  }
  const bytes = await image.png().toBuffer();
  const assetId = randomUUID();
  await saveMedia(`${assetId}.png`, bytes);
  return {
    id: assetId,
    editionId: edition.id,
    filename: `${assetId}.png`,
    mime: 'image/png',
    width: template.width,
    height: template.height,
    rights: {
      source: 'Built-in original typography composition',
      license: 'Workspace-owned layout; no third-party photograph',
      attribution: story.publisher,
      allowedUses: 'Editorial graphic subject to editorial review',
      expiresAt: null,
      approved: true,
      illustration: false,
    },
    diagnostics: result.diagnostics,
    approved: false,
    templateId: template.id,
    canvaUrl: null,
    focalX: 0.5,
    focalY: 0.5,
    createdAt: new Date().toISOString(),
  };
}
