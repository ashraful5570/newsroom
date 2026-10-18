import { cookies } from 'next/headers';
import { z } from 'zod';
import { context, assertOwner } from '@/lib/auth';
import { providerConfig, remoteJson, providerUrl } from '@/lib/integrations';
import { appUrl, required } from '@/lib/config';
import { encrypt } from '@/lib/security';
import { transact } from '@/lib/store';
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  try {
    const ctx = await context();
    assertOwner(ctx);
    if (!['canva', 'meta', 'buffer'].includes(provider)) throw new Error('Unknown provider.');
    const jar = await cookies();
    const raw = jar.get(`oauth_${provider}`)?.value;
    jar.delete(`oauth_${provider}`);
    const saved = z
      .object({ state: z.string(), verifier: z.string(), actor: z.string() })
      .parse(JSON.parse(raw || '{}'));
    const url = new URL(request.url);
    if (saved.state !== url.searchParams.get('state') || saved.actor !== ctx.actor)
      throw new Error('OAuth state mismatch.');
    const code = url.searchParams.get('code');
    if (!code) throw new Error('Authorization was not granted.');
    const config = providerConfig(provider as 'canva' | 'meta' | 'buffer');
    if (!config.tokenUrl) throw new Error('Token contract missing.');
    const token = z
      .object({
        access_token: z.string(),
        refresh_token: z.string().optional(),
        expires_in: z.number().optional(),
      })
      .parse(
        await remoteJson(
          config.tokenUrl,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: `Basic ${Buffer.from(`${required(`${provider.toUpperCase()}_CLIENT_ID`)}:${required(`${provider.toUpperCase()}_CLIENT_SECRET`)}`).toString('base64')}`,
            },
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              code,
              redirect_uri: `${appUrl()}/api/oauth/${provider}/callback`,
              code_verifier: saved.verifier,
            }).toString(),
          },
          provider
        )
      );
    await remoteJson(
      providerUrl(config, config.profilePath),
      { headers: { Authorization: `Bearer ${token.access_token}` } },
      provider
    );
    await transact(ctx.workspaceId, (s) => {
      const c = s.connections.find((c) => c.provider === provider)!;
      c.tokenEncrypted = encrypt(token.access_token);
      c.status = 'Connected';
      c.lastSuccess = new Date().toISOString();
      c.lastError = null;
      c.permissions = config.scopes;
    });
    return Response.redirect(new URL('/?view=settings', appUrl()));
  } catch (e) {
    const u = new URL('/', appUrl());
    u.searchParams.set('authError', e instanceof Error ? e.message : 'OAuth failed');
    return Response.redirect(u);
  }
}
