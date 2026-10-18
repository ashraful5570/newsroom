import { randomBytes, createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { context, assertOwner, HttpError } from '@/lib/auth';
import { providerConfig } from '@/lib/integrations';
import { appUrl, required } from '@/lib/config';
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const ctx = await context();
    assertOwner(ctx);
    const { provider } = await params;
    if (!['canva', 'meta', 'buffer'].includes(provider)) throw new Error('Unknown OAuth provider.');
    const config = providerConfig(provider as 'canva' | 'meta' | 'buffer');
    if (!config.authorizeUrl || !config.tokenUrl)
      throw new Error('OAuth contract is not configured.');
    const state = randomBytes(32).toString('base64url'),
      verifier = randomBytes(64).toString('base64url');
    const jar = await cookies();
    jar.set(`oauth_${provider}`, JSON.stringify({ state, verifier, actor: ctx.actor }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: `/api/oauth/${provider}/callback`,
    });
    const url = new URL(config.authorizeUrl);
    url.searchParams.set('client_id', required(`${provider.toUpperCase()}_CLIENT_ID`));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', `${appUrl()}/api/oauth/${provider}/callback`);
    url.searchParams.set('scope', config.scopes.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set(
      'code_challenge',
      createHash('sha256').update(verifier).digest('base64url')
    );
    url.searchParams.set('code_challenge_method', 'S256');
    return new URL(request.url).searchParams.has('prepare')
      ? Response.json({ url: url.href })
      : Response.redirect(url);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'OAuth failed' },
      { status: e instanceof HttpError ? e.status : 422 }
    );
  }
}
