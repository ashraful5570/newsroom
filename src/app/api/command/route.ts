import { context, checkOrigin, HttpError, rateLimit } from '@/lib/auth';
import { commandSchema } from '@/lib/schema';
import { command } from '@/lib/commands';
import { ZodError } from 'zod';
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const ctx = await context();
    rateLimit(ctx.actor);
    const text = await request.text();
    if (text.length > 200000) throw new HttpError(413, 'Request too large.');
    const { action, input } = commandSchema.parse(JSON.parse(text));
    const result = await command(ctx, action, input);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof ZodError
            ? e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
            : e instanceof Error
              ? e.message
              : 'Request failed',
      },
      { status: e instanceof HttpError ? e.status : e instanceof ZodError ? 400 : 422 }
    );
  }
}
