'use client';
import { createBrowserClient } from '@supabase/ssr';
import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Newspaper } from 'lucide-react';
import { Button } from './ui/button';
export function Login({ message }: { message: string }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const configured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  async function signIn(google = false) {
    if (!configured) return;
    setBusy(true);
    try {
      const client = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const result = google
        ? await client.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${location.origin}/auth/callback` },
          })
        : await client.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: `${location.origin}/auth/callback` },
          });
      if (result.error) throw result.error;
      if (!google) toast.success('Check your email for a secure sign-in link.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <div className="login-art">
        <div className="brand">
          <span className="brand-mark">
            <Newspaper />
          </span>
          newsroom<span className="brand-dot">.</span>
        </div>
        <h1>
          Good journalism.
          <br />A clearer workflow.
        </h1>
        <p>
          Discover the story. Check the facts.
          <br />
          Make every word count.
        </p>
        <div className="login-rule" />
        <span>YOUR EDITORIAL DESK, CONNECTED.</span>
      </div>
      <form
        className="login-form"
        onSubmit={(e) => {
          e.preventDefault();
          void signIn();
        }}
      >
        <span className="eyebrow">WELCOME TO YOUR WORKSPACE</span>
        <h2>Sign in to Newsroom</h2>
        <p>{message}</p>
        {configured ? (
          <>
            <label>
              Email address
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="editor@yournewsroom.com"
              />
            </label>
            <Button disabled={busy}>
              Email me a sign-in link <ArrowRight size={16} />
            </Button>
            <div className="divider-label">or</div>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void signIn(true)}
            >
              Continue with Google
            </Button>
            <small>Only authenticated members can access their workspace.</small>
          </>
        ) : (
          <div className="notice">
            Server configuration is required. Follow the deployment guide to configure Supabase. For
            local evaluation, start with NEWSROOM_MODE=sandbox.
          </div>
        )}
      </form>
    </main>
  );
}
