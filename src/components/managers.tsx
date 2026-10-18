'use client';
import Image from 'next/image';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  ExternalLink,
  Rss,
  ShieldCheck,
  Link2,
  Trash2,
  Search,
  PanelsTopLeft,
  ArrowRight,
} from 'lucide-react';
import type { State, Template, Portal } from '@/lib/schema';
import { uuid, localTime } from '@/lib/utils';
import type { WorkspaceProps } from './types';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';
import { toast } from 'sonner';
export function Sources(props: WorkspaceProps) {
  const { state, run, busy } = props;
  const [editing, setEditing] = useState<State['sources'][number] | 'new' | null>(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState(false);
  const [feeds, setFeeds] = useState<{
    sourceId: string;
    items: { url: string; items: number }[];
  } | null>(null);
  async function find(source: State['sources'][number]) {
    const result = await run('source.findFeeds', { url: source.url });
    setFeeds({ sourceId: source.id, items: result.feeds as { url: string; items: number }[] });
  }
  return (
    <>
      <div className="section-toolbar">
        <div className="search-input">
          <Search size={16} />
          <input
            placeholder="Find a source…"
            aria-label="Find a source"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="button-row">
          <Button variant="outline" onClick={() => setSuggestions(!suggestions)}>
            Source suggestions{' '}
            <span className="count-label">
              {state.suggestions.filter((s) => s.decision === 'pending').length}
            </span>
          </Button>
          <Button onClick={() => setEditing('new')}>
            <Plus size={16} />
            Add source
          </Button>
        </div>
      </div>
      <div className="notice">
        <ShieldCheck size={18} />
        <span>
          Only retrieve permitted content. Owner-selected priority controls fetch order and never
          establishes reliability. Website profiles stay disabled until an ingestion method is
          confirmed.
        </span>
      </div>
      <div className="panel table-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Publisher</th>
                <th>Category / language</th>
                <th>Method</th>
                <th>Priority</th>
                <th>Retrieval status</th>
                <th>Enabled</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {state.sources
                .filter((s) => (s.name + s.category).toLowerCase().includes(query.toLowerCase()))
                .map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="table-name">
                        <span
                          className={`publisher-icon ${s.sourceType === 'facebook' ? 'facebook-icon' : ''}`}
                        >
                          {s.sourceType === 'facebook'
                            ? 'f'
                            : s.name
                                .split(' ')
                                .filter((w) => w !== 'The')
                                .slice(0, 2)
                                .map((w) => w[0])
                                .join('')}
                        </span>
                        <div>
                          <b>{s.name}</b>
                          <small>
                            {s.url ? (
                              <a href={s.url} target="_blank" rel="noopener noreferrer">
                                {new URL(s.url).hostname} <ExternalLink size={10} />
                              </a>
                            ) : (
                              'Official URL not supplied'
                            )}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {s.category}
                      <small className="block">{s.language === 'bn' ? 'Bangla' : 'English'}</small>
                    </td>
                    <td>
                      <span className="pill">{s.sourceType}</span>
                      <small className="block">{s.maxStories} stories / run</small>
                    </td>
                    <td>
                      <span className="priority-dots">
                        {'●'.repeat(s.priority)}
                        <span>{'●'.repeat(5 - s.priority)}</span>
                      </span>
                    </td>
                    <td>
                      <span className={`status-label ${s.lastSuccessAt ? 'success' : ''}`}>
                        <span className={s.lastSuccessAt ? 'green-dot' : 'amber-dot'} />
                        {s.status}
                      </span>
                      <small className="block">
                        {s.lastCheckedAt ? localTime(s.lastCheckedAt) : 'Not yet retrieved'}
                      </small>
                    </td>
                    <td>
                      <button
                        className={`switch ${s.enabled ? 'on' : ''}`}
                        role="switch"
                        aria-checked={s.enabled}
                        aria-label={`Enable ${s.name}`}
                        disabled={busy}
                        onClick={() =>
                          void run('source.save', { ...s, enabled: !s.enabled }).catch(() => {})
                        }
                      >
                        <span />
                      </button>
                    </td>
                    <td>
                      <button className="text-link" onClick={() => setEditing(s)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="subheading">
        <h2>Permission-aware discovery</h2>
        <p>Discover actual feed links published in a website’s metadata. No guessed feed URLs.</p>
      </div>
      <div className="cards-grid">
        {state.sources
          .filter((s) => s.sourceType === 'website')
          .map((s) => (
            <div className="panel mini-card" key={s.id}>
              <Rss size={19} />
              <h3>{s.name}</h3>
              <p>Find and validate RSS/Atom links, then review before activating.</p>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void find(s).catch(() => {})}
              >
                Discover feeds <ArrowRight size={14} />
              </Button>
            </div>
          ))}
      </div>
      {suggestions && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Source discovery assistant</h2>
              <p>
                Curated starting points, not AI reliability verdicts. Suggestions require your
                approval.
              </p>
            </div>
          </div>
          {state.suggestions
            .filter((s) => s.decision === 'pending')
            .map((s) => (
              <div className="suggestion-row" key={s.id}>
                <div>
                  <h3>
                    {s.name}{' '}
                    <a href={s.url} target="_blank" rel="noreferrer">
                      <ExternalLink size={13} />
                    </a>
                  </h3>
                  <small>
                    {s.category} · {s.language}
                  </small>
                  <p>{s.reason}</p>
                  <small>{s.method}</small>
                </div>
                <div className="button-row">
                  <Button
                    variant="outline"
                    onClick={() =>
                      void run('suggestion.decide', { id: s.id, decision: 'rejected' }).catch(
                        () => {}
                      )
                    }
                  >
                    Reject
                  </Button>
                  <Button
                    onClick={() =>
                      void run('suggestion.decide', { id: s.id, decision: 'added' }).catch(() => {})
                    }
                  >
                    Add source
                  </Button>
                </div>
              </div>
            ))}
        </section>
      )}
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add a news source' : 'Edit source'}
      >
        {editing && (
          <SourceForm
            {...props}
            value={editing === 'new' ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
      <Dialog open={!!feeds} onClose={() => setFeeds(null)} title="Discovered feed endpoints">
        {feeds?.items.length ? (
          feeds.items.map((f) => (
            <div className="feed-result" key={f.url}>
              <b>{f.items} valid entries</b>
              <code>{f.url}</code>
              <Button
                onClick={() => {
                  const source = state.sources.find((s) => s.id === feeds.sourceId)!;
                  void run('source.save', {
                    ...source,
                    url: f.url,
                    sourceType: 'rss',
                    ingestionPolicy: 'feed',
                    status: 'Validated feed; ready to enable',
                    enabled: true,
                  })
                    .then(() => setFeeds(null))
                    .catch(() => {});
                }}
              >
                Use this feed
              </Button>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <Rss />
            <h3>No validated feed links found.</h3>
            <p>
              Use a publisher-authorized feed URL or import stories manually. No guessed endpoints
              were registered.
            </p>
          </div>
        )}
      </Dialog>
    </>
  );
}
const basicSource = z.object({
  name: z.string().min(2).max(120),
  url: z.url().or(z.literal('')),
  sourceType: z.enum(['rss', 'atom', 'website', 'sitemap', 'api', 'facebook', 'manual']),
  language: z.enum(['en', 'bn']),
  country: z.string(),
  category: z.string().min(1),
  priority: z.string(),
  maxStories: z.string(),
  ingestionPolicy: z.enum(['manual', 'feed', 'authorized-api', 'public-extraction']),
  reliability: z.string(),
});
function SourceForm({
  value,
  onDone,
  run,
  busy,
}: WorkspaceProps & { value: State['sources'][number] | null; onDone: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof basicSource>>({
    resolver: zodResolver(basicSource),
    defaultValues: {
      name: value?.name || '',
      url: value?.url || '',
      sourceType: value?.sourceType || 'rss',
      language: value?.language || 'en',
      country: value?.country || 'Bangladesh',
      category: value?.category || 'Bangladesh',
      priority: String(value?.priority || 3),
      maxStories: String(value?.maxStories || 20),
      ingestionPolicy: value?.ingestionPolicy || 'feed',
      reliability: value?.reliability || '',
    },
  });
  return (
    <form
      className="form-stack"
      onSubmit={handleSubmit(async (data) => {
        try {
          await run('source.save', {
            ...value,
            ...data,
            id: value?.id || uuid(),
            priority: Number(data.priority),
            maxStories: Number(data.maxStories),
            enabled: value?.enabled || false,
            status: value?.status || 'Not yet retrieved',
            lastCheckedAt: value?.lastCheckedAt || null,
            lastSuccessAt: value?.lastSuccessAt || null,
            failures: value?.failures || [],
          });
          onDone();
        } catch {}
      })}
    >
      <label>
        Publisher name
        <input {...register('name')} />
        {errors.name && <small className="error-text">{errors.name.message}</small>}
      </label>
      <label>
        Website, feed, or confirmed Facebook page URL
        <input {...register('url')} placeholder="https://…" />
        {errors.url && <small className="error-text">{errors.url.message}</small>}
      </label>
      <div className="form-grid">
        <label>
          Source type
          <select {...register('sourceType')}>
            {['rss', 'atom', 'website', 'sitemap', 'api', 'facebook', 'manual'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Ingestion policy
          <select {...register('ingestionPolicy')}>
            <option value="manual">Manual / permission pending</option>
            <option value="feed">Permitted feed</option>
            <option value="public-extraction">
              Owner-permitted public extraction (robots enforced)
            </option>
            <option value="authorized-api">Authorized API (adapter required)</option>
          </select>
        </label>
        <label>
          Language
          <select {...register('language')}>
            <option value="en">English</option>
            <option value="bn">Bangla</option>
          </select>
        </label>
        <label>
          Category
          <input {...register('category')} list="categories" />
          <datalist id="categories">
            {[
              'Bangladesh',
              'International',
              'Politics',
              'Technology',
              'Business',
              'Entertainment',
              'Sports',
              'Viral',
              'Science',
              'Lifestyle',
              'Custom',
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </datalist>
        </label>
        <label>
          Country
          <input {...register('country')} />
        </label>
        <label>
          Priority
          <select {...register('priority')}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} — {n === 5 ? 'Highest' : 'Fetch order'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Max stories per run
          <input type="number" min="1" max="100" {...register('maxStories')} />
        </label>
      </div>
      <label>
        Reliability / permissions notes
        <textarea {...register('reliability')} rows={3} />
      </label>
      {value?.failures.length ? (
        <details>
          <summary>Failure history ({value.failures.length})</summary>
          {value.failures.map((f, i) => (
            <p key={i}>{f}</p>
          ))}
        </details>
      ) : null}
      <div className="form-actions">
        {value && (
          <Button
            type="button"
            variant="danger"
            disabled={busy}
            onClick={() =>
              void run('source.delete', { id: value.id })
                .then(onDone)
                .catch(() => {})
            }
          >
            <Trash2 size={15} />
            Remove
          </Button>
        )}
        <Button disabled={busy}>Save source</Button>
      </div>
    </form>
  );
}
export function SourceImport({
  state,
  run,
  busy,
  onDone,
}: WorkspaceProps & { onDone: () => void }) {
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void run('story.import', {
          sourceId: f.get('sourceId'),
          title: f.get('title'),
          url: f.get('url'),
          body: f.get('body'),
          publishedAt: f.get('publishedAt') || undefined,
        })
          .then(onDone)
          .catch(() => {});
      }}
    >
      <div className="notice">
        Import text you are permitted to use. This creates an unverified source record, never an
        automatic fact verification.
      </div>
      <label>
        Source
        <select name="sourceId" required>
          {state.sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Original story / post URL
        <input type="url" name="url" required placeholder="https://publisher.com/original-story" />
      </label>
      <label>
        Original headline
        <input name="title" required minLength={3} />
      </label>
      <label>
        Original source text
        <textarea name="body" required minLength={10} rows={7} />
      </label>
      <label>
        Publication timestamp, if known
        <input name="publishedAt" placeholder="2026-10-18T12:00:00+06:00" />
      </label>
      <Button disabled={busy}>Import for evidence review</Button>
    </form>
  );
}
export function Portals({ state, run, busy }: WorkspaceProps) {
  const [editing, setEditing] = useState<Portal | 'new' | null>(null);
  return (
    <>
      <div className="section-toolbar">
        <span className="muted">{state.portals.length} brands in your workspace</span>
        <Button onClick={() => setEditing('new')}>
          <Plus size={16} />
          Add portal
        </Button>
      </div>
      <div className="cards-grid portal-cards">
        {state.portals.map((p) => (
          <section className="panel portal-card" key={p.id}>
            <div className="portal-card-top" style={{ borderColor: p.color }}>
              <span className="portal-logo large" style={{ background: p.color }}>
                {p.name[0]}
              </span>
              <span className="pill">{p.language === 'bn' ? 'বাংলা' : 'English'}</span>
            </div>
            <h2>{p.name}</h2>
            <p>{p.style}</p>
            <div className="portal-card-meta">
              <span>{state.editions.filter((e) => e.portalId === p.id).length} editions</span>
              <span>{p.templateIds.length} templates</span>
            </div>
            <Button variant="outline" onClick={() => setEditing(p)}>
              Edit brand and preferences <ArrowRight size={14} />
            </Button>
          </section>
        ))}
      </div>
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Create news portal' : 'Portal brand settings'}
      >
        {editing && (
          <PortalForm
            value={editing === 'new' ? null : editing}
            state={state}
            run={run}
            busy={busy}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </>
  );
}
function PortalForm({
  value,
  state,
  run,
  busy,
  onDone,
}: WorkspaceProps & { value: Portal | null; onDone: () => void }) {
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void run('portal.save', {
          id: value?.id || uuid(),
          name: f.get('name'),
          slug: f.get('slug'),
          language: f.get('language'),
          color: f.get('color'),
          logo: f.get('logo'),
          style: f.get('style'),
          captionStyle: f.get('captionStyle'),
          hashtags: String(f.get('hashtags'))
            .split(/[,\s]+/)
            .filter(Boolean),
          postingDefaults: f.get('postingDefaults'),
          templateIds: f.getAll('templateIds'),
        })
          .then(onDone)
          .catch(() => {});
      }}
    >
      <div className="form-grid">
        <label>
          Portal name
          <input name="name" defaultValue={value?.name} required />
        </label>
        <label>
          Slug
          <input name="slug" pattern="[a-z0-9-]+" defaultValue={value?.slug} required />
        </label>
        <label>
          Language
          <select name="language" defaultValue={value?.language || 'en'}>
            <option value="en">English</option>
            <option value="bn">Bangla</option>
          </select>
        </label>
        <label>
          Brand color
          <input name="color" type="color" defaultValue={value?.color || '#2563eb'} />
        </label>
      </div>
      <label>
        Logo URL (used for branding reference)
        <input name="logo" defaultValue={value?.logo} />
      </label>
      <label>
        Editorial style / prompt preferences
        <textarea
          name="style"
          rows={4}
          defaultValue={value?.style || 'Clear, concise, credible. Use only locked facts.'}
        />
      </label>
      <label>
        Caption style
        <textarea
          name="captionStyle"
          defaultValue={value?.captionStyle || 'One short factual sentence.'}
        />
      </label>
      <label>
        Hashtags, separated by spaces
        <input name="hashtags" defaultValue={value?.hashtags.join(' ')} />
      </label>
      <label>
        Posting defaults
        <textarea
          name="postingDefaults"
          defaultValue={value?.postingDefaults || 'Human approval required.'}
        />
      </label>
      <fieldset>
        <legend>Assigned templates</legend>
        {state.templates.length ? (
          state.templates.map((t) => (
            <label key={t.id} className="checkbox-label">
              <input
                name="templateIds"
                type="checkbox"
                value={t.id}
                defaultChecked={value?.templateIds.includes(t.id)}
              />
              {t.name}
            </label>
          ))
        ) : (
          <p className="muted">No templates yet. You can add them later.</p>
        )}
      </fieldset>
      <div className="form-actions">
        {value && (
          <Button
            type="button"
            variant="danger"
            onClick={() =>
              void run('portal.delete', { id: value.id })
                .then(onDone)
                .catch(() => {})
            }
          >
            Remove portal
          </Button>
        )}
        <Button disabled={busy}>Save portal</Button>
      </div>
    </form>
  );
}
export function Templates({ state, run, busy }: WorkspaceProps) {
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const [preview, setPreview] = useState<{ preview?: string; diagnostics?: string[] } | null>(null);
  const [dataset, setDataset] = useState<string | null>(null);
  async function test(id: string) {
    try {
      const r = await fetch('/api/template-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setPreview(b);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Test failed');
    }
  }
  return (
    <>
      <div className="section-toolbar">
        <span className="muted">Add existing Canva references or an original built-in layout.</span>
        <div className="button-row">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run('canva.templates')
                .then((r) => setDataset(JSON.stringify(r.result, null, 2)))
                .catch(() => {})
            }
          >
            Discover Brand Templates
          </Button>
          <Button onClick={() => setEditing('new')}>
            <Plus size={16} />
            Register template
          </Button>
        </div>
      </div>
      <div className="notice">
        <Link2 size={18} />
        <span>
          Existing Canva designs are registered as references. Only eligible Brand Templates can
          expose supported autofill fields. Built-in graphics are clearly labeled and are not
          natively editable Canva designs.
        </span>
      </div>
      {!state.templates.length ? (
        <section className="panel empty-state tall">
          <span className="empty-icon">
            <PanelsTopLeft size={32} />
          </span>
          <h2>Your brand. Your first template.</h2>
          <p>
            No Canva templates have been supplied. Connect an authorized Canva account and register
            a template, or create an original built-in typography layout to get started.
          </p>
          <Button onClick={() => setEditing('new')}>
            <Plus size={16} />
            Add your first template
          </Button>
          <small>The newsroom works without Canva templates.</small>
        </section>
      ) : (
        <div className="cards-grid">
          {state.templates.map((t) => (
            <div className="panel template-card" key={t.id}>
              <div className="template-art">
                <div style={{ aspectRatio: `${t.width}/${t.height}` }}>
                  <span>NEWSROOM</span>
                  <b>{t.kind === 'fallback' ? 'Your story.\nClearly told.' : 'Canva reference'}</b>
                  <small>
                    {t.width} × {t.height}
                  </small>
                </div>
              </div>
              <div className="template-info">
                <span className="pill">
                  {t.kind === 'fallback'
                    ? 'Built-in compositor'
                    : t.kind === 'canva-brand'
                      ? 'Canva Brand Template'
                      : 'Canva design reference'}
                </span>
                <h3>{t.name}</h3>
                <p>{t.status}</p>
                <small>
                  {t.portalIds.length} portal assignments · {Object.keys(t.fields).length} mapped
                  fields
                </small>
                <div className="button-row">
                  <Button variant="outline" onClick={() => setEditing(t)}>
                    Edit mapping
                  </Button>
                  <Button variant="outline" onClick={() => void test(t.id)}>
                    Test template
                  </Button>
                </div>
                {t.kind === 'canva-brand' && (
                  <button
                    className="text-link"
                    onClick={() =>
                      void run('canva.dataset', { id: t.id })
                        .then((r) => setDataset(JSON.stringify(r.result, null, 2)))
                        .catch(() => {})
                    }
                  >
                    Retrieve autofill dataset
                  </button>
                )}
                {t.kind === 'canva-design' && t.reference && (
                  <a
                    className="text-link"
                    href={
                      /^https:\/\/www\.canva\.com\//.test(t.reference)
                        ? t.reference
                        : `https://www.canva.com/design/${encodeURIComponent(t.reference)}/edit`
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open registered design <ExternalLink size={13} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Template registration and field mapping"
        wide
      >
        {editing && (
          <TemplateForm
            value={editing === 'new' ? null : editing}
            state={state}
            run={run}
            busy={busy}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
      <Dialog
        open={!!preview}
        onClose={() => setPreview(null)}
        title="Template test — synthetic sample"
      >
        <Image
          unoptimized
          width={1080}
          height={1080}
          className="asset-preview"
          src={preview?.preview || '/icon.svg'}
          alt="Synthetic template test in Bangla and English"
        />
        {preview?.diagnostics?.map((d) => (
          <p key={d} className="muted">
            {d}
          </p>
        ))}
      </Dialog>
      <Dialog open={!!dataset} onClose={() => setDataset(null)} title="Canva API response">
        <pre className="json-preview">{dataset}</pre>
        <p>
          Map only fields exposed by the authorized dataset. Registration alone does not prove
          autofill eligibility.
        </p>
      </Dialog>
    </>
  );
}
function TemplateForm({
  value,
  state,
  run,
  busy,
  onDone,
}: WorkspaceProps & { value: Template | null; onDone: () => void }) {
  const [kind, setKind] = useState(value?.kind || 'fallback');
  const [fields, setFields] = useState(
    Object.entries(value?.fields || {}).map(([name, mapping]) => ({ name, mapping }))
  );
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void run('template.save', {
          id: value?.id || uuid(),
          name: f.get('name'),
          kind,
          reference: f.get('reference') || '',
          width: Number(f.get('width')),
          height: Number(f.get('height')),
          maxLines: Number(f.get('maxLines')),
          minFont: Number(f.get('minFont')),
          margin: Number(f.get('margin')),
          portalIds: f.getAll('portalIds'),
          fields: Object.fromEntries(fields.filter((x) => x.name).map((x) => [x.name, x.mapping])),
          status: '',
          eligible: false,
        })
          .then(onDone)
          .catch(() => {});
      }}
    >
      <div className="form-grid">
        <label>
          Template name
          <input name="name" required defaultValue={value?.name} />
        </label>
        <label>
          Renderer / reference type
          <select value={kind} onChange={(e) => setKind(e.target.value as Template['kind'])}>
            <option value="fallback">Built-in original layout</option>
            <option value="canva-brand">Canva Brand Template</option>
            <option value="canva-design">Existing Canva design reference</option>
          </select>
        </label>
      </div>
      {kind !== 'fallback' && (
        <label>
          Canva reference ID or design URL
          <input
            name="reference"
            required
            defaultValue={value?.reference}
            placeholder="Paste your authorized reference"
          />
        </label>
      )}
      <div className="form-grid">
        <label>
          Width (px)
          <input
            type="number"
            name="width"
            min={320}
            max={4096}
            defaultValue={value?.width || 1080}
            required
          />
        </label>
        <label>
          Height (px)
          <input
            type="number"
            name="height"
            min={320}
            max={4096}
            defaultValue={value?.height || 1080}
            required
          />
        </label>
        <label>
          Safe margin (px)
          <input
            type="number"
            name="margin"
            defaultValue={value?.margin || 64}
            min={16}
            max={200}
          />
        </label>
        <label>
          Minimum font size
          <input
            type="number"
            name="minFont"
            defaultValue={value?.minFont || 32}
            min={16}
            max={96}
          />
        </label>
        <label>
          Maximum headline lines
          <input
            type="number"
            name="maxLines"
            defaultValue={value?.maxLines || 5}
            min={1}
            max={8}
          />
        </label>
      </div>
      <fieldset>
        <legend>Portal assignments</legend>
        <div className="checkbox-grid">
          {state.portals.map((p) => (
            <label key={p.id} className="checkbox-label">
              <input
                type="checkbox"
                name="portalIds"
                value={p.id}
                defaultChecked={value?.portalIds.includes(p.id)}
              />
              {p.name}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Autofill field mapping</legend>
        <p className="muted">
          Use exact field keys from the authorized Canva dataset. Arbitrary element editing is not
          supported. Built-in typography uses headline and source directly.
        </p>
        {fields.map((field, i) => (
          <div className="mapping-row" key={i}>
            <input
              aria-label="Canva dataset field"
              placeholder="Dataset field key"
              value={field.name}
              onChange={(e) =>
                setFields(
                  fields.map((f, index) => (index === i ? { ...f, name: e.target.value } : f))
                )
              }
            />
            <ArrowRight size={15} />
            <select
              aria-label="News content mapping"
              value={field.mapping}
              onChange={(e) =>
                setFields(
                  fields.map((f, index) =>
                    index === i ? { ...f, mapping: e.target.value as typeof f.mapping } : f
                  )
                )
              }
            >
              {['headline', 'supportingText', 'image', 'logo', 'source'].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <button
              type="button"
              className="icon-button"
              aria-label="Remove mapping"
              onClick={() => setFields(fields.filter((_, index) => index !== i))}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() => setFields([...fields, { name: '', mapping: 'headline' }])}
        >
          <Plus size={14} />
          Add field mapping
        </Button>
      </fieldset>
      <div className="form-actions">
        {value && (
          <Button
            type="button"
            variant="danger"
            onClick={() =>
              void run('template.delete', { id: value.id })
                .then(onDone)
                .catch(() => {})
            }
          >
            Remove template
          </Button>
        )}
        <Button disabled={busy}>Save template</Button>
      </div>
    </form>
  );
}
