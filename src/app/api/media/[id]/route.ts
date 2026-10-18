import { context, HttpError } from '@/lib/auth';
import { readState } from '@/lib/store';
import { loadMedia } from '@/lib/design';
export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await context();
    const { id } = await params;
    const s = await readState(ctx.workspaceId);
    const asset = s.media.find((m) => m.id === id);
    if (!asset) return Response.json({ error: 'Asset not found' }, { status: 404 });
    const data = await loadMedia(asset.filename);
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `inline; filename="newsroom-${asset.id}.png"`,
      },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Asset failed' },
      { status: e instanceof HttpError ? e.status : 500 }
    );
  }
}
