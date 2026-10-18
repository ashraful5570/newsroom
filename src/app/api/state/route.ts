import { context, HttpError } from '@/lib/auth';
import { readState, publicState } from '@/lib/store';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const ctx = await context();
    return Response.json(
      {
        state: publicState(await readState(ctx.workspaceId)),
        sandbox: ctx.sandbox,
        role: ctx.role,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Request failed' },
      { status: e instanceof HttpError ? e.status : 500 }
    );
  }
}
