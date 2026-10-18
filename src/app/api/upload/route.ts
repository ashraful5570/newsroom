import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { context, assertWrite, HttpError, rateLimit } from '@/lib/auth';
import { transact } from '@/lib/store';
import { saveMedia } from '@/lib/media-storage';
import { z } from 'zod';
export async function POST(request: Request) {
  try {
    const expected = new URL(process.env.APP_URL || 'http://localhost:3000').origin;
    if (request.headers.get('origin') !== expected)
      throw new HttpError(403, 'Invalid upload origin.');
    const ctx = await context();
    assertWrite(ctx);
    rateLimit(ctx.actor);
    if (Number(request.headers.get('content-length')) > 9_000_000)
      throw new Error('Maximum upload is 8 MB.');
    const form = await request.formData();
    const file = form.get('file');
    if (
      !(file instanceof File) ||
      file.size > 8_000_000 ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    )
      throw new Error('Upload a PNG, JPEG, or WebP up to 8 MB.');
    const rights = z
      .object({
        source: z.string().min(1).max(1000),
        license: z.string().min(1).max(1000),
        attribution: z.string().max(1000),
        allowedUses: z.string().min(1).max(1000),
      })
      .parse(
        Object.fromEntries(
          ['source', 'license', 'attribution', 'allowedUses'].map((k) => [k, form.get(k)])
        )
      );
    const bytes = await sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize(4096, 4096, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    const meta = await sharp(bytes).metadata();
    const id = randomUUID();
    await saveMedia(`${id}.png`, bytes);
    await transact(ctx.workspaceId, (s) => {
      s.media.push({
        id,
        editionId: null,
        filename: `${id}.png`,
        mime: 'image/png',
        width: meta.width!,
        height: meta.height!,
        rights: {
          ...rights,
          expiresAt: null,
          approved: false,
          illustration: form.get('illustration') === 'on',
        },
        diagnostics: [
          'User-uploaded image. Rights declarations are supplied by the editor, not independently verified.',
        ],
        approved: false,
        templateId: null,
        canvaUrl: null,
        focalX: 0.5,
        focalY: 0.5,
        createdAt: new Date().toISOString(),
      });
    });
    return Response.json({ id, message: 'Image uploaded; review its rights before use.' });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Upload failed' },
      { status: e instanceof HttpError ? e.status : 422 }
    );
  }
}
