import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
export const metadata: Metadata = {
  title: 'Newsroom — Clear. Concise. Credible.',
  description:
    'An editorial workspace for discovery, bilingual storytelling, and responsible publishing.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#111827' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
