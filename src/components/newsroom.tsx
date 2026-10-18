'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  Compass,
  ListChecks,
  Sparkles,
  Palette,
  CalendarDays,
  Send,
  Rss,
  Layers,
  PanelsTopLeft,
  ChartNoAxesCombined,
  Settings,
  Search,
  Plus,
  ChevronDown,
  ArrowUpRight,
  ArrowRight,
  Newspaper,
  Sun,
  Moon,
  ShieldCheck,
  PanelRightClose,
  Menu,
  Activity,
  Clock,
  FileText,
} from 'lucide-react';
import type { State } from '@/lib/schema';
import { localTime } from '@/lib/utils';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';
import { Login } from './login';
import type { View, Run, WorkspaceProps } from './types';
import { Sources, SourceImport, Portals, Templates } from './managers';
import { Discovery, EditorialStudio, Calendar, Published } from './workflow';
import { IntegrationSettings, Onboarding, Analytics } from './settings';
const navigation: [View, string, typeof LayoutDashboard][] = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['discover', 'Discover News', Compass],
  ['queue', 'Editorial Queue', ListChecks],
  ['studio', 'AI Studio', Sparkles],
  ['design', 'Design Studio', Palette],
  ['calendar', 'Publishing Calendar', CalendarDays],
  ['published', 'Published Posts', Send],
  ['sources', 'Sources', Rss],
  ['portals', 'News Portals', Layers],
  ['templates', 'Templates', PanelsTopLeft],
  ['analytics', 'Analytics', ChartNoAxesCombined],
  ['settings', 'Settings', Settings],
];
async function fetchState() {
  const r = await fetch('/api/state', { cache: 'no-store' });
  const b = await r.json();
  if (!r.ok) throw new Error(b.error || 'Cannot load workspace.');
  return b as { state: State; sandbox: boolean; role: string };
}
export function Newsroom() {
  const query = useQuery({ queryKey: ['state'], queryFn: fetchState, refetchInterval: 4000 });
  const client = useQueryClient();
  const [view, setView] = useState<View>('dashboard');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [dark, setDark] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const booted = useRef(false);
  /* eslint-disable react-hooks/set-state-in-effect -- Hydrate browser-only preferences and initialize first-run setup from the first server response. */
  // Browser URL and persisted theme are applied after hydration; no server equivalent exists.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const v = params.get('view');
    if (navigation.some((n) => n[0] === v)) setView(v as View);
    const theme = localStorage.getItem('newsroom-theme');
    setDark(theme === 'dark');
    document.documentElement.dataset.theme = theme || 'light';
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');
    const error = params.get('authError');
    if (error) toast.error(error);
  }, []);
  // The first successful server response decides whether the setup dialog should open.
  useEffect(() => {
    if (query.data && !booted.current) {
      booted.current = true;
      if (!query.data.state.workspace.onboarded && !sessionStorage.getItem('wizard-dismissed'))
        setWizard(true);
    }
  }, [query.data]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') setSidebar(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  function navigate(v: View) {
    setView(v);
    setSidebar(false);
    history.replaceState(null, '', `/?view=${v}`);
  }
  const run: Run = async (action, input = {}) => {
    const previous = client.getQueryData<{ state: State; sandbox: boolean; role: string }>([
      'state',
    ]);
    const optimistic = action === 'story.select' || action === 'media.approve';
    if (optimistic && previous)
      client.setQueryData(['state'], {
        ...previous,
        state: {
          ...previous.state,
          stories: previous.state.stories.map((s) =>
            action === 'story.select' && s.id === input.id
              ? { ...s, selected: input.selected === true }
              : s
          ),
          media: previous.state.media.map((m) =>
            action === 'media.approve' && m.id === input.id
              ? { ...m, approved: input.approved === true }
              : m
          ),
        },
      });
    setBusy(true);
    try {
      const r = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, input }),
      });
      const b = await r.json();
      await client.invalidateQueries({ queryKey: ['state'] });
      if (!r.ok) throw new Error(b.error || 'Action failed.');
      if (!['story.select', 'workspace.save'].includes(action))
        toast.success(b.message || 'Workspace updated');
      return b;
    } catch (e) {
      if (optimistic && previous) client.setQueryData(['state'], previous);
      toast.error(e instanceof Error ? e.message : 'Action failed');
      throw e;
    } finally {
      setBusy(false);
    }
  };
  if (query.isPending)
    return (
      <div className="loading-shell">
        <div className="brand">
          newsroom<span className="brand-dot">.</span>
        </div>
        <div className="skeleton" />
        <div className="skeleton" />
        <p>Opening your editorial desk…</p>
      </div>
    );
  if (query.isError || !query.data)
    return <Login message={query.error?.message || 'Unable to load workspace.'} />;
  const { state, sandbox } = query.data;
  const props = { state, run, busy };
  const current = navigation.find((n) => n[0] === view)!;
  const selected = state.stories.filter((s) => s.selected).length;
  const reviewing = state.editions.filter((e) =>
    ['Draft', 'Awaiting Review'].includes(e.status)
  ).length;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebar ? 'sidebar-open' : ''}`}>
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Newspaper size={20} />
          </span>
          newsroom<span className="brand-dot">.</span>
        </Link>
        <button className="workspace-switch" onClick={() => setWizard(true)}>
          <span className="workspace-icon">{state.workspace.name[0].toUpperCase()}</span>
          <span>
            <b>{state.workspace.name}</b>
            <small>Editorial workspace</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {navigation.map(([key, label, Icon], index) => (
            <div key={key}>
              {index === 7 && <div className="nav-label nav-secondary">MANAGE</div>}
              <button
                className={`nav-item ${view === key ? 'active' : ''}`}
                onClick={() => navigate(key)}
              >
                <Icon size={18} />
                <span>{label}</span>
                {key === 'queue' && selected > 0 && <span className="nav-count">{selected}</span>}
                {key === 'studio' && reviewing > 0 && <span className="small-dot" />}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="trust-card">
            <ShieldCheck size={18} />
            <div>
              <b>Editorial integrity first</b>
              <small>Human review. Every story.</small>
            </div>
          </div>
          <button className="user-profile" onClick={() => navigate('settings')}>
            <span className="avatar">ED</span>
            <span>
              <b>Newsroom owner</b>
              <small>{sandbox ? 'Local sandbox' : 'Secure workspace'}</small>
            </span>
            <Settings size={16} />
          </button>
        </div>
      </aside>
      {sidebar && (
        <button
          className="mobile-overlay"
          onClick={() => setSidebar(false)}
          aria-label="Close navigation"
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-only"
            onClick={() => setSidebar(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span> <b>{current[1]}</b>
          </div>
          <div className="topbar-actions">
            <div className="global-search">
              <Search size={16} />
              <input
                ref={searchRef}
                aria-label="Search stories"
                placeholder="Search stories…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (e.target.value) navigate('discover');
                }}
              />
              <kbd>⌘ K</kbd>
            </div>
            <button
              className="icon-button"
              title="Toggle theme"
              aria-label="Toggle theme"
              onClick={() => {
                const next = !dark;
                setDark(next);
                document.documentElement.dataset.theme = next ? 'dark' : 'light';
                localStorage.setItem('newsroom-theme', next ? 'dark' : 'light');
              }}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <span className="topbar-separator" />
            <span className="avatar small">ED</span>
          </div>
        </header>
        {sandbox && (
          <div className="sandbox-strip">
            <span className="small-dot" />
            LOCAL SANDBOX{' '}
            <span>
              Persistent local data · Authentication bypassed · No connected APIs or automatic
              publishing
            </span>
          </div>
        )}
        <div className="workspace-body">
          <main className={`page-content ${view === 'dashboard' ? 'with-insights' : ''}`}>
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  {view === 'dashboard' ? 'YOUR EDITORIAL DESK' : 'NEWSROOM WORKSPACE'}
                </div>
                <h1>{view === 'dashboard' ? 'A clearer view of your newsroom.' : current[1]}</h1>
                <p>{descriptions[view]}</p>
              </div>
              <div className="heading-actions">
                {view === 'dashboard' && (
                  <Button variant="outline" onClick={() => setWizard(true)}>
                    <ListChecks size={16} />
                    Setup guide
                  </Button>
                )}
                <Button onClick={() => setImportOpen(true)}>
                  <Plus size={16} />
                  Import story
                </Button>
              </div>
            </div>
            {view === 'dashboard' && (
              <Dashboard {...props} navigate={navigate} setup={() => setWizard(true)} />
            )}{' '}
            {(view === 'discover' || view === 'queue') && (
              <Discovery
                {...props}
                search={search}
                queue={view === 'queue'}
                openStudio={() => navigate('studio')}
              />
            )}{' '}
            {view === 'studio' && <EditorialStudio {...props} />}{' '}
            {view === 'design' && <EditorialStudio {...props} designOnly />}
            {view === 'sources' && <Sources {...props} />}{' '}
            {view === 'portals' && <Portals {...props} />}{' '}
            {view === 'templates' && <Templates {...props} />}{' '}
            {view === 'calendar' && <Calendar {...props} />}{' '}
            {view === 'published' && <Published {...props} />}{' '}
            {view === 'settings' && (
              <IntegrationSettings {...props} sandbox={sandbox} onSetup={() => setWizard(true)} />
            )}{' '}
            {view === 'analytics' && <Analytics {...props} />}
            <footer className="page-footer">
              <span>
                <ShieldCheck size={13} />
                Clear. Concise. Credible.
              </span>
              <span>All times Asia/Dhaka · {sandbox ? 'Sandbox' : 'Private workspace'}</span>
            </footer>
          </main>
          {view === 'dashboard' && <Insights {...props} navigate={navigate} />}
        </div>
      </div>
      <nav className="bottom-nav">
        {navigation
          .filter((n) => ['dashboard', 'discover', 'queue', 'studio', 'settings'].includes(n[0]))
          .map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => navigate(key)}
              className={view === key ? 'active' : ''}
            >
              <Icon size={20} />
              <span>{label.replace(' News', '').replace('Editorial ', '')}</span>
            </button>
          ))}
      </nav>
      <Dialog open={importOpen} onClose={() => setImportOpen(false)} title="Import a source story">
        <SourceImport {...props} onDone={() => setImportOpen(false)} />
      </Dialog>
      <Dialog
        open={wizard}
        onClose={() => {
          setWizard(false);
          sessionStorage.setItem('wizard-dismissed', '1');
        }}
        title="Set up your newsroom"
        wide
      >
        <Onboarding
          {...props}
          navigate={(v) => {
            setWizard(false);
            sessionStorage.setItem('wizard-dismissed', '1');
            navigate(v);
          }}
          onDone={() => setWizard(false)}
        />
      </Dialog>
    </div>
  );
}
const descriptions: Record<View, string> = {
  dashboard: 'From the first source to the final post. Every story, in one place.',
  discover: 'Find the stories that matter. Keep the original sources in view.',
  queue: 'Your selected stories, ready for evidence review and editorial work.',
  studio: 'One factual record. Thoughtful stories in English and Bangla.',
  design: 'Turn approved words into clear, consistent visual stories.',
  calendar: 'Plan your publishing. All schedules use Asia/Dhaka time.',
  published: 'A transparent record of what went out, and where.',
  sources: 'Curate your sources. Permission and attribution come first.',
  portals: 'Distinct voices and brands, built on the same facts.',
  templates: 'Your layouts, your branding. Add Canva templates whenever you’re ready.',
  analytics: 'Real newsroom activity and API usage. No invented engagement.',
  settings: 'Manage your workspace, integrations, and editorial preferences.',
};
function Dashboard({
  state,
  navigate,
  setup,
}: WorkspaceProps & { navigate: (v: View) => void; setup: () => void }) {
  const metrics = [
    ['Discovered stories', state.stories.length, Compass, 'From your selected sources'],
    [
      'Awaiting review',
      state.editions.filter((e) => e.status === 'Awaiting Review' || e.status === 'Draft').length,
      FileText,
      'Human approval required',
    ],
    [
      'Scheduled posts',
      state.publications.filter((p) => p.status === 'Scheduled').length,
      CalendarDays,
      'Durable publishing queue',
    ],
    [
      'Published posts',
      state.publications.filter((p) => p.status === 'Published').length,
      Send,
      'Recorded publication outcomes',
    ],
  ] as const;
  return (
    <>
      <section className="metric-grid">
        {metrics.map(([title, value, Icon, foot]) => (
          <div className="metric-card" key={title}>
            <div>
              <span>{title}</span>
              <Icon size={17} />
            </div>
            <strong>{value.toLocaleString()}</strong>
            <small>{foot}</small>
          </div>
        ))}
      </section>
      {!state.workspace.onboarded && (
        <section className="onboarding-banner">
          <div className="banner-icon">
            <Sparkles size={23} />
          </div>
          <div>
            <span className="eyebrow">A GOOD STORY STARTS WITH A GOOD SETUP</span>
            <h2>Make this newsroom yours.</h2>
            <p>Review sources, shape your brands, and connect your editorial tools.</p>
          </div>
          <Button onClick={setup}>
            Continue setup <ArrowRight size={16} />
          </Button>
        </section>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Your editorial pipeline</h2>
            <p>A deliberate path from discovery to publication.</p>
          </div>
          <span className="pill">
            <span className="green-dot" />
            Workspace active
          </span>
        </div>
        <div className="pipeline">
          {[
            ['Discover', state.stories.length, Compass, 'discover'],
            ['Verify', state.stories.filter((s) => s.facts.locked).length, ShieldCheck, 'queue'],
            ['Create', state.editions.length, Sparkles, 'studio'],
            ['Design', state.media.length, Palette, 'design'],
            ['Publish', state.publications.length, Send, 'calendar'],
          ].map(([label, value, Icon, key], i) => {
            const I = Icon as typeof Compass;
            return (
              <div className="pipeline-step" key={String(label)}>
                <button onClick={() => navigate(key as View)}>
                  <span className={`pipeline-icon stage-${i}`}>
                    <I size={21} />
                  </span>
                  <b>{String(label)}</b>
                  <strong>{String(value)}</strong>
                </button>
                {i < 4 && <ArrowRight size={15} className="pipeline-arrow" />}
              </div>
            );
          })}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              On the editorial desk{' '}
              <span className="count-label">{state.stories.filter((s) => s.selected).length}</span>
            </h2>
            <p>The stories you’ve chosen to take forward.</p>
          </div>
          <button className="text-link" onClick={() => navigate('queue')}>
            View queue <ArrowUpRight size={15} />
          </button>
        </div>
        {state.stories.some((s) => s.selected) ? (
          <div className="compact-stories">
            {state.stories
              .filter((s) => s.selected)
              .slice(0, 4)
              .map((s) => (
                <button key={s.id} onClick={() => navigate('studio')}>
                  <span className="source-monogram">{s.publisher.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <b>{s.title}</b>
                    <small>
                      {s.publisher} · {localTime(s.discoveredAt)}
                    </small>
                  </div>
                  <span className="pill">
                    {s.facts.locked ? 'Facts locked' : 'Review evidence'}
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-icon">
              <Newspaper size={28} />
            </span>
            <h3>Your next story starts here.</h3>
            <p>
              Discover news from a permitted feed, or import an original
              <br className="desktop-only" /> source story to begin your editorial workflow.
            </p>
            <Button variant="outline" onClick={() => navigate('discover')}>
              <Compass size={16} />
              Discover news <ArrowRight size={15} />
            </Button>
          </div>
        )}
      </section>
      <section className="two-column">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Your news portals</h2>
              <p>Independent brands. Shared editorial standards.</p>
            </div>
            <button
              className="icon-button"
              onClick={() => navigate('portals')}
              aria-label="Manage portals"
            >
              <ArrowUpRight size={18} />
            </button>
          </div>
          <div className="portal-list">
            {state.portals.slice(0, 3).map((p) => (
              <button key={p.id} onClick={() => navigate('portals')}>
                <span className="portal-logo" style={{ background: p.color }}>
                  {p.name === 'JhalMuri News' ? 'ঝা' : p.name.slice(0, 1)}
                </span>
                <div>
                  <b>{p.name}</b>
                  <small>
                    {p.language === 'bn' ? 'Bangla' : 'English'} ·{' '}
                    {state.editions.filter((e) => e.portalId === p.id).length} editions
                  </small>
                </div>
                <span className="pill">Active</span>
              </button>
            ))}
          </div>
          <button className="panel-bottom-link" onClick={() => navigate('portals')}>
            Manage all {state.portals.length} portals <ArrowRight size={14} />
          </button>
        </div>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Source health</h2>
              <p>Know where your reporting begins.</p>
            </div>
            <button
              className="icon-button"
              onClick={() => navigate('sources')}
              aria-label="Manage sources"
            >
              <ArrowUpRight size={18} />
            </button>
          </div>
          <div className="source-health-stats">
            <div>
              <strong>{state.sources.filter((s) => s.enabled).length}</strong>
              <small>
                <span className="green-dot" />
                Enabled
              </small>
            </div>
            <div>
              <strong>{state.sources.filter((s) => !s.enabled).length}</strong>
              <small>
                <span className="amber-dot" />
                Needs setup
              </small>
            </div>
            <div>
              <strong>{state.sources.filter((s) => s.failures.length > 0).length}</strong>
              <small>
                <span className="red-dot" />
                With failures
              </small>
            </div>
          </div>
          <div className="source-notice">
            <ShieldCheck size={17} />
            <p>
              Publisher profiles are saved. Validate a permitted feed before enabling automated
              retrieval.
            </p>
          </div>
          <button className="panel-bottom-link" onClick={() => navigate('sources')}>
            Review your sources <ArrowRight size={14} />
          </button>
        </div>
      </section>
    </>
  );
}
function Insights({ state, navigate }: WorkspaceProps & { navigate: (v: View) => void }) {
  const active = state.jobs.filter((j) => j.status === 'running' || j.status === 'queued');
  return (
    <aside className="insights">
      <div className="insight-title">
        <span>
          <Activity size={16} />
          LIVE DESK
        </span>
        <PanelRightClose size={16} />
      </div>
      <section>
        <div className="aside-heading">
          <h3>Publishing up next</h3>
          <CalendarDays size={16} />
        </div>
        {state.publications.some((p) => p.status === 'Scheduled') ? (
          state.publications
            .filter((p) => p.status === 'Scheduled')
            .slice(0, 3)
            .map((p) => (
              <div className="aside-event" key={p.id}>
                <Clock size={17} />
                <div>
                  <b>
                    {
                      state.portals.find(
                        (x) => x.id === state.editions.find((e) => e.id === p.editionId)?.portalId
                      )?.name
                    }
                  </b>
                  <small>{localTime(p.scheduledAt)}</small>
                </div>
              </div>
            ))
        ) : (
          <div className="aside-empty">
            <div className="calendar-mini">
              <span>UP NEXT</span>
              <CalendarDays size={26} />
            </div>
            <b>A little room to plan.</b>
            <p>Approved stories will appear here when you schedule them.</p>
            <button className="text-link" onClick={() => navigate('calendar')}>
              Open calendar <ArrowRight size={14} />
            </button>
          </div>
        )}
      </section>
      <section>
        <div className="aside-heading">
          <h3>Activity</h3>
          <span className="pill">{active.length} active jobs</span>
        </div>
        {state.events.length ? (
          <div className="activity-list">
            {state.events.slice(0, 5).map((e) => (
              <div key={e.id}>
                <span className={e.level === 'error' ? 'red-dot' : 'small-dot'} />
                <div>
                  <p>{e.message}</p>
                  <small>{localTime(e.at)}</small>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="activity-list">
            <div>
              <span className="green-dot" />
              <div>
                <p>Your editorial workspace is open.</p>
                <small>Ready for your first story</small>
              </div>
            </div>
            <div>
              <span className="small-dot" />
              <div>
                <p>{state.portals.length} editable portal profiles prepared.</p>
                <small>Brand settings available</small>
              </div>
            </div>
          </div>
        )}
      </section>
      <section className="editorial-note">
        <span className="note-icon">
          <ShieldCheck size={19} />
        </span>
        <span className="eyebrow">THE NEWSROOM STANDARD</span>
        <h3>
          Trust is part
          <br />
          of the workflow.
        </h3>
        <p>Every edition starts with attributed evidence and ends with an editor’s approval.</p>
        <div>Accuracy before engagement.</div>
      </section>
      <div className="aside-bottom">
        <span className="green-dot" />
        Workspace online <span>Asia/Dhaka</span>
      </div>
    </aside>
  );
}
