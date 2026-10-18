import { supabaseServer } from '@/lib/auth';
import { appUrl } from '@/lib/config';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (code) {
    const client = await supabaseServer();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return Response.redirect(new URL('/', appUrl()));
  }
  return Response.redirect(new URL('/?authError=Sign-in%20failed', appUrl()));
}
