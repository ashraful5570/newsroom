'use client';
import { Button } from '@/components/ui/button';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="fatal">
      <h1>Something interrupted your workspace.</h1>
      <p>Your saved work is retained. Retry to reconnect.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
