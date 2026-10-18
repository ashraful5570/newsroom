import type { State } from '@/lib/schema';
export type Run = (
  action: string,
  input?: Record<string, unknown>
) => Promise<Record<string, unknown>>;
export type WorkspaceProps = { state: State; run: Run; busy: boolean };
export type View =
  | 'dashboard'
  | 'discover'
  | 'queue'
  | 'studio'
  | 'design'
  | 'calendar'
  | 'published'
  | 'sources'
  | 'portals'
  | 'templates'
  | 'analytics'
  | 'settings';
