import { context, assertOwner, checkOrigin } from '@/lib/auth';
import { readState } from '@/lib/store';
import { svgCard, prepareFontCache } from '@/lib/design';
import sharp from 'sharp';
import { z } from 'zod';
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const ctx = await context();
    assertOwner(ctx);
    const { id } = z.object({ id: z.uuid() }).parse(await request.json());
    const state = await readState(ctx.workspaceId);
    const t = state.templates.find((t) => t.id === id);
    if (!t) throw new Error('Template not found.');
    if (t.kind !== 'fallback')
      throw new Error(
        'Canva Test Template requires a verified autofill contract and authorized sample asset. Registration does not establish eligibility. Open Canva manually or test a built-in renderer.'
      );
    const result = svgCard({
      headline: 'নিউজরুমের পরীক্ষামূলক শিরোনাম · Sample headline',
      portalName: 'Template test — sample only',
      color: '#2563eb',
      source: 'Synthetic layout test, not news',
      width: t.width,
      height: t.height,
      margin: t.margin,
      maxLines: t.maxLines,
      minFont: t.minFont,
    });
    await prepareFontCache();
    const png = await sharp(Buffer.from(result.svg)).png().toBuffer();
    return Response.json({
      preview: `data:image/png;base64,${png.toString('base64')}`,
      diagnostics: result.diagnostics,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Test failed' },
      { status: 422 }
    );
  }
}
