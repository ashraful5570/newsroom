'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Compass,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Plus,
  Trash2,
  Lock,
  Check,
  RefreshCw,
  Copy,
  Download,
  Send,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import type { Story, Facts, Edition, Content, State } from '@/lib/schema';
import { verificationStates } from '@/lib/schema';
import { uuid, localTime } from '@/lib/utils';
import type { WorkspaceProps } from './types';
import { Button } from './ui/button';
import { ImageManager } from './image-manager';
import { Dialog } from './ui/dialog';
export function Discovery({
  state,
  run,
  busy,
  queue,
  search,
  openStudio,
}: WorkspaceProps & { queue: boolean; search: string; openStudio: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const [time, setTime] = useState('all');
  const [language, setLanguage] = useState('all');
  const [source, setSource] = useState('all');
  const [category, setCategory] = useState('all');
  const [order, setOrder] = useState('recent');
  const [review, setReview] = useState('all');
  const [ledger, setLedger] = useState<string | null>(null);
  const [generate, setGenerate] = useState(false);
  const [portalIds, setPortalIds] = useState<string[]>([]);
  const [mode, setMode] = useState('manual');
  const filtered = state.stories
    .filter(
      (s) =>
        (!queue || s.selected) &&
        s.title.toLowerCase().includes(search.toLowerCase()) &&
        (language === 'all' || s.language === language) &&
        (source === 'all' || s.sourceId === source) &&
        (category === 'all' || s.category === category) &&
        (review === 'all' ||
          (review === 'unreviewed' && !s.facts.locked) ||
          (review === 'published' &&
            state.editions.some((e) => e.storyId === s.id && e.status === 'Published'))) &&
        (time === 'all' ||
          (s.publishedAt &&
            new Date(s.publishedAt).getTime() >
              (time === 'today'
                ? new Date(
                    `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now))}T00:00:00+06:00`
                  ).getTime()
                : now - Number(time) * 3600000)))
    )
    .sort((a, b) =>
      order === 'score' ? b.score - a.score : b.discoveredAt.localeCompare(a.discoveredAt)
    );
  const selected = state.stories.filter((s) => s.selected);
  const currentLedger = state.stories.find((s) => s.id === ledger);
  const active = state.jobs.find(
    (j) => j.type === 'discovery' && ['queued', 'running'].includes(j.status)
  );
  return (
    <>
      <div className="section-toolbar">
        <div className="button-row">
          <Button
            disabled={busy || !!active}
            onClick={() => void run('discovery.start').catch(() => {})}
          >
            <Compass size={16} />
            {active ? 'Discovery in progress…' : 'Scrape News'}
          </Button>
          <span className="muted">Enabled, permitted sources only</span>
        </div>
        <span className="pill">{filtered.length} stories</span>
      </div>
      {active && (
        <div className="job-progress">
          <RefreshCw size={16} className="spin" />
          <span>{active.message}</span>
          <progress value={active.progress} max={100} />
          <small>{active.progress}%</small>
        </div>
      )}
      <div className="filters">
        <select
          aria-label="Publication time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        >
          <option value="all">Any time</option>
          <option value="today">Today in Dhaka</option>
          <option value="6">Last 6 hours</option>
          <option value="24">Last 24 hours</option>
        </select>
        <select
          aria-label="Story category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="all">All categories</option>
          {[
            ...new Set(['Bangladesh', 'International', ...state.sources.map((s) => s.category)]),
          ].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="Story language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="all">All languages</option>
          <option value="en">English</option>
          <option value="bn">Bangla</option>
        </select>
        <select
          aria-label="Story source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="all">All sources</option>
          {state.sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Story review state"
          value={review}
          onChange={(e) => setReview(e.target.value)}
        >
          <option value="all">Any review state</option>
          <option value="unreviewed">Unreviewed</option>
          <option value="published">Already published</option>
        </select>
        <select
          aria-label="Story ordering"
          value={order}
          onChange={(e) => setOrder(e.target.value)}
        >
          <option value="recent">Recently discovered</option>
          <option value="score">Editorial interest score</option>
        </select>
      </div>
      {selected.length > 0 && (
        <div className="selection-bar">
          <span>
            <b>{selected.length}</b> stories selected
          </span>
          <div className="button-row">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run('story.queue', { ids: selected.map((s) => s.id) }).catch(() => {})
              }
            >
              Add to Editorial Queue
            </Button>
            <Button onClick={() => setGenerate(true)}>
              <Sparkles size={15} />
              Generate News
            </Button>
          </div>
        </div>
      )}
      {filtered.length ? (
        <div className="story-grid">
          {filtered.map((s) => (
            <article className={`panel story-card ${s.selected ? 'selected' : ''}`} key={s.id}>
              <div className="story-meta">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    aria-label={`Select ${s.title}`}
                    checked={s.selected}
                    onChange={(e) =>
                      void run('story.select', { id: s.id, selected: e.target.checked }).catch(
                        () => {}
                      )
                    }
                  />
                  <span>{s.category}</span>
                </label>
                <span className="pill">{s.language === 'bn' ? 'বাংলা' : 'EN'}</span>
              </div>
              <h2>{s.title}</h2>
              <div className="story-byline">
                {s.publisher} <span>·</span> {localTime(s.publishedAt)}
              </div>
              <p>{s.summary || 'No source summary available.'}</p>
              {s.relatedUrls.length > 0 && (
                <details>
                  <summary>
                    {s.relatedUrls.length + 1} related source URLs · heuristic event cluster
                  </summary>
                  <ul>
                    {[s.url, ...s.relatedUrls].map((u) => (
                      <li key={u}>
                        <a href={u} target="_blank" rel="noreferrer">
                          {u}
                        </a>
                      </li>
                    ))}
                  </ul>
                  <small>Headline overlap is not independent corroboration.</small>
                </details>
              )}
              <details className="score-detail">
                <summary>Editorial interest: {Math.round(s.score)} / 100</summary>
                {s.rationale.map((r) => (
                  <small className="block" key={r}>
                    {r}
                  </small>
                ))}
              </details>
              <div className="story-card-actions">
                <button className="text-link" onClick={() => setLedger(s.id)}>
                  <ShieldCheck size={15} />
                  {s.facts.locked ? 'Facts locked' : 'Review evidence'}
                </button>
                <a href={s.url} target="_blank" rel="noreferrer" className="text-link">
                  Read original <ExternalLink size={14} />
                </a>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel empty-state tall">
          <span className="empty-icon">
            <Compass size={30} />
          </span>
          <h2>{queue ? 'Your editorial queue is clear.' : 'Find your next story.'}</h2>
          <p>
            {queue
              ? 'Select a source story in Discover News to add it here.'
              : 'Enable a validated RSS/Atom feed in Sources, then click Scrape News. You can also import original text using the Import story button.'}
          </p>
          <small>No sample news or fabricated stories are included.</small>
        </div>
      )}
      <Dialog
        open={!!ledger}
        onClose={() => setLedger(null)}
        title="Fact ledger and source evidence"
        wide
      >
        {currentLedger && <FactLedger {...{ state, run, busy }} story={currentLedger} />}
      </Dialog>
      <Dialog
        open={generate}
        onClose={() => setGenerate(false)}
        title="Create portal-specific editions"
      >
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            void (async () => {
              for (const s of selected)
                await run('edition.generate', { storyId: s.id, portalIds, mode });
              setGenerate(false);
              openStudio();
            })().catch(() => {});
          }}
        >
          <div className="notice">
            Each selected story needs a locked factual record. All portal editions derive from that
            same lock.
          </div>
          <fieldset>
            <legend>News portals</legend>
            {state.portals.map((p) => (
              <label key={p.id} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={portalIds.includes(p.id)}
                  onChange={(e) =>
                    setPortalIds(
                      e.target.checked
                        ? [...portalIds, p.id]
                        : portalIds.filter((id) => id !== p.id)
                    )
                  }
                />
                {p.name} · {p.language}
              </label>
            ))}
          </fieldset>
          <label>
            Generation method
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="manual">Manual bilingual draft — no API cost</option>
              <option value="openai">OpenAI — requires verified connection and API usage</option>
            </select>
          </label>
          <p className="muted">
            A manual draft copies locked source-language facts and clearly marks the other language
            for editor completion. It is not an automatic translation.
          </p>
          <Button disabled={busy || !portalIds.length}>
            Create {selected.length} × {portalIds.length} editions
          </Button>
        </form>
      </Dialog>
    </>
  );
}
export function FactLedger({ story, state, run, busy }: WorkspaceProps & { story: Story }) {
  const [facts, setFacts] = useState<Facts>(structuredClone(story.facts));
  const [version, setVersion] = useState(story.facts.version);
  const [dirty, setDirty] = useState(false);
  function change(next: Facts) {
    setFacts(next);
    setDirty(true);
  }
  function changeClaim(index: number, data: Partial<Facts['claims'][number]>) {
    change({ ...facts, claims: facts.claims.map((c, i) => (i === index ? { ...c, ...data } : c)) });
  }
  async function save() {
    await run('facts.save', { id: story.id, facts, expectedVersion: version });
    setVersion(version + 1);
    setDirty(false);
  }
  return (
    <div className="form-stack ledger">
      <div className="ledger-title">
        <h3>{story.title}</h3>
        <a href={story.url} target="_blank" rel="noreferrer" className="text-link">
          {story.publisher} <ExternalLink size={13} />
        </a>
        <span className="pill">
          Version {story.facts.version} · {story.facts.locked ? 'Locked' : 'Unlocked'}
        </span>
      </div>
      <div className="notice">
        Evidence is distinct from inference. Wire copies share an origin. “Verified” requires
        retrieved excerpts from at least two independent origins; editor confirmation is still
        required.
      </div>
      <details>
        <summary>Original source text</summary>
        <p className="source-body">{story.body}</p>
      </details>
      {facts.claims.map((claim, index) => (
        <fieldset key={claim.id} className="claim-card">
          <legend>Claim {index + 1}</legend>
          <label>
            Exact factual claim
            <textarea
              value={claim.text}
              onChange={(e) => changeClaim(index, { text: e.target.value })}
              rows={3}
            />
          </label>
          <div className="form-grid">
            <label>
              Claim type
              <select
                value={claim.type}
                onChange={(e) => changeClaim(index, { type: e.target.value as typeof claim.type })}
              >
                {['fact', 'identity', 'number', 'date', 'quote', 'inference'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              Verification status
              <select
                value={claim.status}
                onChange={(e) =>
                  changeClaim(index, { status: e.target.value as typeof claim.status })
                }
              >
                {verificationStates.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          </div>
          {claim.evidence.map((evidence, i) => (
            <div className="evidence-card" key={i}>
              <label>
                Evidence URL
                <input
                  value={evidence.url}
                  type="url"
                  onChange={(e) =>
                    changeClaim(index, {
                      evidence: claim.evidence.map((v, k) =>
                        k === i ? { ...v, url: e.target.value, retrievedAt: null } : v
                      ),
                    })
                  }
                />
              </label>
              <div className="form-grid">
                <label>
                  Publisher
                  <input
                    value={evidence.publisher}
                    onChange={(e) =>
                      changeClaim(index, {
                        evidence: claim.evidence.map((v, k) =>
                          k === i ? { ...v, publisher: e.target.value } : v
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Independent origin / wire identity
                  <input
                    value={evidence.origin}
                    placeholder="Use the same origin for wire copies"
                    onChange={(e) =>
                      changeClaim(index, {
                        evidence: claim.evidence.map((v, k) =>
                          k === i ? { ...v, origin: e.target.value } : v
                        ),
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Supporting excerpt
                <textarea
                  value={evidence.excerpt}
                  onChange={(e) =>
                    changeClaim(index, {
                      evidence: claim.evidence.map((v, k) =>
                        k === i ? { ...v, excerpt: e.target.value, retrievedAt: null } : v
                      ),
                    })
                  }
                />
              </label>
              <div className="button-row">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run('evidence.retrieve', { url: evidence.url })
                      .then((r) =>
                        changeClaim(index, {
                          evidence: claim.evidence.map((v, k) =>
                            k === i
                              ? {
                                  ...v,
                                  url: String(r.url),
                                  excerpt: String(r.excerpt),
                                  retrievedAt: String(r.retrievedAt),
                                }
                              : v
                          ),
                        })
                      )
                      .catch(() => {})
                  }
                >
                  <RefreshCw size={13} />
                  Retrieve source excerpt
                </Button>
                <small>
                  {evidence.retrievedAt
                    ? 'Retrieved ' + localTime(evidence.retrievedAt)
                    : 'Manual excerpt; not independently retrieved'}
                </small>
              </div>
            </div>
          ))}
          <div className="button-row">
            <Button
              variant="outline"
              onClick={() =>
                changeClaim(index, {
                  evidence: [
                    ...claim.evidence,
                    {
                      url: story.url,
                      publisher: story.publisher,
                      origin: story.publisher,
                      excerpt: '',
                      retrievedAt: null,
                    },
                  ],
                })
              }
            >
              <Plus size={13} />
              Evidence URL
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                change({ ...facts, claims: facts.claims.filter((_, i) => i !== index) })
              }
            >
              <Trash2 size={13} />
              Remove claim
            </Button>
          </div>
          <label>
            Conflicting account / uncertainty notes
            <textarea
              value={claim.conflict}
              onChange={(e) => changeClaim(index, { conflict: e.target.value })}
            />
          </label>
        </fieldset>
      ))}
      <Button
        variant="outline"
        onClick={() =>
          change({
            ...facts,
            claims: [
              ...facts.claims,
              {
                id: uuid(),
                text: '',
                type: 'fact',
                evidence: [
                  {
                    url: story.url,
                    publisher: story.publisher,
                    origin: story.publisher,
                    excerpt: '',
                    retrievedAt: null,
                  },
                ],
                status: 'Unverified',
                conflict: '',
              },
            ],
          })
        }
      >
        <Plus size={15} />
        Add factual claim
      </Button>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={facts.highRisk}
          onChange={(e) => change({ ...facts, highRisk: e.target.checked, riskApproved: false })}
        />
        High-risk allegation, sensitive event, or developing story
      </label>
      {facts.highRisk && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={facts.riskApproved}
            onChange={(e) => change({ ...facts, riskApproved: e.target.checked })}
          />
          I explicitly approve this high-risk record after reviewing attribution and uncertainty.
        </label>
      )}
      <label>
        Editorial notes
        <textarea
          value={facts.notes}
          onChange={(e) => change({ ...facts, notes: e.target.value })}
        />
      </label>
      <div className="form-actions">
        <Button
          variant="outline"
          disabled={busy || !dirty}
          onClick={() => void save().catch(() => {})}
        >
          Save facts
        </Button>
        <Button
          disabled={busy || dirty || !facts.claims.length || story.facts.locked}
          onClick={() => void run('facts.lock', { id: story.id }).catch(() => {})}
        >
          <Lock size={15} />
          {story.facts.locked ? 'Facts locked' : 'Lock factual record'}
        </Button>
      </div>
      <details>
        <summary>
          Compare fact revisions ({state.factRevisions.filter((r) => r.storyId === story.id).length}
          )
        </summary>
        {state.factRevisions
          .filter((r) => r.storyId === story.id)
          .slice()
          .reverse()
          .map((r) => (
            <div className="revision" key={r.id}>
              <b>
                Fact version {r.facts.version} · {localTime(r.at)}
              </b>
              <small className="block">Editor {r.actor}</small>
              {r.facts.claims.map((c) => (
                <p key={c.id}>
                  {c.text} — {c.status}
                </p>
              ))}
            </div>
          ))}
      </details>
      <small>
        Saving facts unlocks the record and invalidates affected articles, graphics, approvals, and
        schedules.
      </small>
    </div>
  );
}
export function EditorialStudio(props: WorkspaceProps & { designOnly?: boolean }) {
  const { state, designOnly } = props;
  const [selected, setSelected] = useState('');
  const [ledger, setLedger] = useState(false);
  const [history, setHistory] = useState(false);
  const edition = state.editions.find((e) => e.id === selected) || state.editions[0];
  const story = state.stories.find((s) => s.id === edition?.storyId);
  const portal = state.portals.find((p) => p.id === edition?.portalId);
  if (!edition || !story || !portal)
    return (
      <section className="panel empty-state tall">
        <span className="empty-icon">
          {designOnly ? <ImageIcon size={30} /> : <Sparkles size={30} />}
        </span>
        <h2>Your story, ready to take shape.</h2>
        <p>
          Select a story in Discover News, review and lock its evidence, then create portal
          editions. Both English and Bangla can be edited here.
        </p>
      </section>
    );
  return (
    <>
      <div className="section-toolbar">
        <select
          aria-label="Select edition"
          value={edition.id}
          onChange={(e) => setSelected(e.target.value)}
        >
          {state.editions.map((e) => (
            <option key={e.id} value={e.id}>
              {state.portals.find((p) => p.id === e.portalId)?.name} — {e.content.headlineEn}
            </option>
          ))}
        </select>
        <div className="button-row">
          <span className="pill">{edition.status}</span>
          <Button variant="outline" onClick={() => setHistory(true)}>
            Revision history ({state.revisions.filter((r) => r.editionId === edition.id).length})
          </Button>
        </div>
      </div>
      <details className="panel edition-compare">
        <summary>Compare portal editions of this story</summary>
        <div className="cards-grid">
          {state.editions
            .filter((e) => e.storyId === story.id)
            .map((e) => (
              <div className="comparison-card" key={e.id}>
                <b>{state.portals.find((p) => p.id === e.portalId)?.name}</b>
                <small className="block">
                  Same fact lock v{e.factVersion} · {e.status}
                </small>
                <h3>{e.content.headlineEn}</h3>
                <h3 lang="bn">{e.content.headlinesBn[0]}</h3>
                <p>{e.content.summaryEn || e.content.articleEn.slice(0, 200)}</p>
                <p lang="bn">{e.content.summaryBn || e.content.articleBn.slice(0, 200)}</p>
                <Button variant="outline" onClick={() => setSelected(e.id)}>
                  Edit this edition
                </Button>
              </div>
            ))}
        </div>
      </details>
      <div className="editor-grid">
        <aside className="panel editor-source">
          <div className="editor-pane-heading">
            <ShieldCheck size={16} />
            <b>Source & locked facts</b>
          </div>
          <span className="eyebrow">{story.publisher}</span>
          <h3>{story.title}</h3>
          <a className="text-link" href={story.url} target="_blank" rel="noreferrer">
            Read original <ExternalLink size={13} />
          </a>
          <span className="pill">
            Fact lock v{story.facts.version} · {story.facts.locked ? 'Locked' : 'Unlocked'}
          </span>
          {story.facts.claims.map((c) => (
            <div className="locked-claim" key={c.id}>
              <p>{c.text}</p>
              <small>
                {c.status} · {c.evidence.length} evidence URLs
              </small>
            </div>
          ))}
          <Button variant="outline" onClick={() => setLedger(true)}>
            Review fact ledger
          </Button>
          <details>
            <summary>Source article</summary>
            <p className="source-body">{story.body}</p>
          </details>
          <div className="notice">
            Source text is untrusted. It cannot override editorial instructions or invoke tools.
          </div>
        </aside>
        <section className="panel editor-content">
          <div className="editor-pane-heading">
            <FileText size={16} />
            <b>{portal.name} edition</b>
            <span className="pill">v{edition.revision}</span>
          </div>
          <EditionForm key={`${edition.id}:${edition.revision}`} {...props} edition={edition} />
        </section>
        <aside className="panel editor-preview">
          <div className="editor-pane-heading">
            <ImageIcon size={16} />
            <b>Design & publish</b>
          </div>
          <DesignControls {...props} edition={edition} />
          <PublicationControls {...props} edition={edition} />
        </aside>
      </div>
      <Dialog open={ledger} onClose={() => setLedger(false)} title="Fact ledger" wide>
        <FactLedger {...props} story={story} />
      </Dialog>
      <Dialog open={history} onClose={() => setHistory(false)} title="Revision history" wide>
        {state.revisions
          .filter((r) => r.editionId === edition.id)
          .reverse()
          .map((r) => (
            <div className="revision" key={r.id}>
              <b>
                Version {r.version} · {localTime(r.createdAt)}
              </b>
              <small className="block">Editor {r.actor}</small>
              <h3>{r.content.headlineEn}</h3>
              <p>{r.content.articleEn}</p>
              <h3 lang="bn">{r.content.headlinesBn[0]}</h3>
              <p lang="bn">{r.content.articleBn}</p>
            </div>
          ))}
        {!state.revisions.some((r) => r.editionId === edition.id) && (
          <p>
            No prior revisions. Saving changes records the previous content and editor identity.
          </p>
        )}
      </Dialog>
    </>
  );
}
function EditionForm({ edition, run, busy }: WorkspaceProps & { edition: Edition }) {
  const [content, setContent] = useState<Content>(edition.content);
  const [comment, setComment] = useState(edition.comment);
  const [reviewed, setReviewed] = useState(false);
  const [dirty, setDirty] = useState(false);
  function change<K extends keyof Content>(key: K, value: Content[K]) {
    setContent({ ...content, [key]: value });
    setDirty(true);
  }
  return (
    <div className="form-stack">
      <div className="button-row">
        {['headlines', 'articles', 'caption'].map((part) => (
          <Button
            key={part}
            variant="outline"
            disabled={busy || dirty || edition.status === 'Published'}
            onClick={() =>
              void run('edition.regenerate', {
                id: edition.id,
                part,
                expectedRevision: edition.revision,
              }).catch(() => {})
            }
          >
            <RefreshCw size={12} />
            Regenerate {part}
          </Button>
        ))}
      </div>
      <div className="editor-notice">
        {edition.generationMode === 'manual'
          ? 'Manual editorial draft · Complete both languages before approval.'
          : 'AI-assisted draft · Two-pass model checks do not prove factual accuracy.'}
      </div>
      {edition.flags.length > 0 && (
        <div className="notice error-notice">
          <AlertTriangle size={17} />
          <div>
            {edition.flags.map((f, i) => (
              <p key={i}>{f}</p>
            ))}
          </div>
        </div>
      )}
      <div className="language-heading">
        <span>EN</span>
        <h3>English</h3>
      </div>
      <label>
        Primary headline
        <input value={content.headlineEn} onChange={(e) => change('headlineEn', e.target.value)} />
      </label>
      <label>
        Alternative headline
        <input
          value={content.alternateEn}
          onChange={(e) => change('alternateEn', e.target.value)}
        />
      </label>
      <label>
        Article
        <textarea
          aria-label="Article"
          rows={7}
          value={content.articleEn}
          onChange={(e) => change('articleEn', e.target.value)}
        />
      </label>
      <label>
        One-sentence summary
        <textarea value={content.summaryEn} onChange={(e) => change('summaryEn', e.target.value)} />
      </label>
      <div className="language-heading">
        <span>বাং</span>
        <h3>বাংলা</h3>
      </div>
      {content.headlinesBn.map((h, i) => (
        <label key={i}>
          শিরোনাম {i + 1}
          <input
            lang="bn"
            value={h}
            onChange={(e) =>
              change(
                'headlinesBn',
                content.headlinesBn.map((v, k) => (k === i ? e.target.value : v))
              )
            }
          />
        </label>
      ))}
      <label>
        বাংলা প্রতিবেদন
        <textarea
          aria-label="বাংলা প্রতিবেদন"
          lang="bn"
          rows={7}
          value={content.articleBn}
          onChange={(e) => change('articleBn', e.target.value)}
        />
      </label>
      <label>
        এক বাক্যে সারাংশ
        <textarea
          lang="bn"
          value={content.summaryBn}
          onChange={(e) => change('summaryBn', e.target.value)}
        />
      </label>
      <div className="language-heading">
        <Send size={16} />
        <h3>Social & attribution</h3>
      </div>
      <label>
        Caption
        <textarea
          aria-label="Caption"
          value={content.caption}
          onChange={(e) => change('caption', e.target.value)}
        />
      </label>
      <label>
        Hashtags (up to five)
        <input
          value={content.hashtags.join(' ')}
          onChange={(e) => change('hashtags', e.target.value.split(/\s+/).filter(Boolean))}
        />
      </label>
      <label>
        Article / source first comment
        <textarea
          rows={4}
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            setDirty(true);
          }}
          placeholder="Copy this into the first comment when official automation is unavailable."
        />
      </label>
      <label>
        Attribution URLs, one per line
        <textarea
          value={content.sourceUrls.join('\n')}
          onChange={(e) => change('sourceUrls', e.target.value.split('\n').filter(Boolean))}
        />
      </label>
      <details>
        <summary>SEO & image search keywords</summary>
        <label>
          SEO title
          <input
            value={content.seo.title}
            onChange={(e) => change('seo', { ...content.seo, title: e.target.value })}
          />
        </label>
        <label>
          Description
          <input
            value={content.seo.description}
            onChange={(e) => change('seo', { ...content.seo, description: e.target.value })}
          />
        </label>
        <label>
          Slug
          <input
            value={content.seo.slug}
            onChange={(e) => change('seo', { ...content.seo, slug: e.target.value })}
          />
        </label>
        <label>
          Image search keywords (English)
          <input
            value={content.imageKeywordsEn.join(', ')}
            onChange={(e) =>
              change(
                'imageKeywordsEn',
                e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
          />
        </label>
        <label>
          Image search keywords (Bangla)
          <input
            value={content.imageKeywordsBn.join(', ')}
            onChange={(e) =>
              change(
                'imageKeywordsBn',
                e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
          />
        </label>
      </details>
      <Button
        disabled={busy || !dirty}
        onClick={() =>
          void run('edition.save', {
            id: edition.id,
            content,
            comment,
            expectedRevision: edition.revision,
          }).catch(() => {})
        }
      >
        Save draft & check consistency
      </Button>
      <div className="approval-box">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          I reviewed both languages, names, dates, numbers, quotations, attribution, and uncertainty
          against the locked facts.
        </label>
        <div className="button-row">
          <Button
            variant="outline"
            disabled={busy || edition.status === 'Published'}
            onClick={() => void run('edition.reject', { id: edition.id }).catch(() => {})}
          >
            Return to draft
          </Button>
          <Button
            disabled={busy || dirty || !reviewed || edition.status === 'Published'}
            onClick={() =>
              void run('edition.approve', { id: edition.id, reviewConfirmed: reviewed }).catch(
                () => {}
              )
            }
          >
            <Check size={15} />
            Approve edition
          </Button>
        </div>
      </div>
      <small>
        Any saved edit invalidates approval and existing graphic linkage. Review again before
        publishing.
      </small>
    </div>
  );
}
function DesignControls({ state, run, busy, edition }: WorkspaceProps & { edition: Edition }) {
  const [template, setTemplate] = useState('');
  const asset = state.media.find((m) => m.id === edition.designAssetId);
  const available = state.templates.filter(
    (t) => !t.portalIds.length || t.portalIds.includes(edition.portalId)
  );
  return (
    <div className="form-stack design-controls">
      <ImageManager {...{ state, run, busy, edition }} />
      {asset ? (
        <>
          <Image
            unoptimized
            width={asset.width}
            height={asset.height}
            className="asset-preview"
            src={`/api/media/${asset.id}`}
            alt="Generated editorial graphic requiring visual review"
          />
          <span className="pill">
            Built-in PNG · {asset.width} × {asset.height}
          </span>
          <details>
            <summary>Rendering diagnostics & rights</summary>
            {asset.diagnostics.map((d) => (
              <p key={d}>{d}</p>
            ))}
            <p>{asset.rights.license}</p>
            <p>Attribution: {asset.rights.attribution}</p>
          </details>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={asset.approved}
              onChange={(e) =>
                void run('media.approve', { id: asset.id, approved: e.target.checked }).catch(
                  () => {}
                )
              }
            />
            I inspected typography, overflow, and rights.
          </label>
          <a
            href={`/api/media/${asset.id}`}
            download={`newsroom-${asset.id}.png`}
            className="btn btn-outline"
          >
            <Download size={14} />
            Download PNG
          </a>
        </>
      ) : (
        <div className="design-empty">
          <ImageIcon size={28} />
          <p>No graphic generated yet.</p>
          <small>No stock or AI image is assumed to be licensed.</small>
        </div>
      )}
      <label>
        Graphic template
        <select value={template} onChange={(e) => setTemplate(e.target.value)}>
          <option value="">Select a registered template</option>
          {available.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {t.kind}
            </option>
          ))}
        </select>
      </label>
      <Button
        variant="outline"
        disabled={busy || !template}
        onClick={() =>
          void run('design.generate', { id: edition.id, templateId: template }).catch(() => {})
        }
      >
        <ImageIcon size={14} />
        {asset ? 'Regenerate graphic' : 'Generate graphic'}
      </Button>
      {!available.length && (
        <small>
          Register a built-in or eligible Canva template in Templates. Zero templates never blocks
          article editing.
        </small>
      )}
    </div>
  );
}
function PublicationControls({ state, run, busy, edition }: WorkspaceProps & { edition: Edition }) {
  const [destination, setDestination] = useState<string[]>([]);
  const [time, setTime] = useState('');
  const posts = state.publications.filter((p) => p.editionId === edition.id);
  return (
    <div className="form-stack publish-controls">
      <h3>Publication</h3>
      <span className="pill">{edition.status}</span>
      <div className="notice">
        Automatic provider publishing is disabled until its contract and permissions are validated.
        Due jobs request manual action; no external post is silently created.
      </div>
      <label>
        Destination
        <select
          multiple
          size={3}
          aria-label="Destination"
          value={destination}
          onChange={(e) =>
            setDestination(
              Array.from(e.target.selectedOptions)
                .map((o) => o.value)
                .filter(Boolean)
            )
          }
        >
          <option value="">Select a destination</option>
          {state.connections
            .filter((c) => c.provider === 'meta' || c.provider === 'buffer')
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.status} (manual fallback)
              </option>
            ))}
        </select>
      </label>
      <label>
        Schedule (Asia/Dhaka), or leave blank
        <input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
      </label>
      <Button
        disabled={busy || !destination.length || edition.status !== 'Approved'}
        onClick={() =>
          void run('publication.schedule', {
            id: edition.id,
            destinationIds: destination,
            localTime: time || undefined,
          }).catch(() => {})
        }
      >
        {time ? <CalendarDays size={15} /> : <Send size={15} />}{' '}
        {time ? 'Schedule publication' : 'Prepare manual publishing'}
      </Button>
      {posts.map((p) => (
        <PublicationItem key={p.id} {...{ state, run, busy }} publication={p} />
      ))}
    </div>
  );
}
function PublicationItem({
  state,
  run,
  busy,
  publication: p,
}: WorkspaceProps & { publication: State['publications'][number] }) {
  const edition = state.editions.find((e) => e.id === p.editionId)!;
  return (
    <div className="publication-item">
      <b>{p.status}</b>
      <small className="block">
        {p.scheduledAt ? localTime(p.scheduledAt) : 'Immediate manual workflow'}
      </small>
      <p>{p.response}</p>
      {p.externalUrl && (
        <a className="text-link" href={p.externalUrl} target="_blank" rel="noreferrer">
          View recorded post <ExternalLink size={13} />
        </a>
      )}
      {state.jobs.find((j) => j.id === p.jobId)?.status === 'ambiguous' && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            if (
              confirm(
                'Have you checked this destination for an existing post? This will enable recording the existing URL or manual publication; it will not retry an API request.'
              )
            )
              void run('publication.reconcile', { id: p.id, destinationReviewed: true }).catch(
                () => {}
              );
          }}
        >
          I checked the platform — reconcile manually
        </Button>
      )}
      {p.status === 'Requires Manual Action' && (
        <>
          <div className="button-row">
            <Button
              variant="outline"
              onClick={() =>
                void navigator.clipboard
                  .writeText(`${edition.content.caption}\n${edition.content.hashtags.join(' ')}`)
                  .then(() => toast.success('Caption copied'))
              }
            >
              <Copy size={13} />
              Caption
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void navigator.clipboard
                  .writeText(edition.comment || edition.content.sourceUrls.join('\n'))
                  .then(() => toast.success('Comment copied'))
              }
            >
              <Copy size={13} />
              Comment
            </Button>
          </div>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run('publication.record', {
                id: p.id,
                url: f.get('url'),
                externalId: f.get('externalId'),
              }).catch(() => {});
            }}
          >
            <label>
              Actual post URL
              <input type="url" name="url" required placeholder="https://www.facebook.com/…" />
            </label>
            <label>
              Actual platform post ID
              <input name="externalId" required />
            </label>
            <Button variant="outline" disabled={busy}>
              Record manual publication
            </Button>
            <small>Editor-reported, not API-verified.</small>
          </form>
        </>
      )}
      {['Scheduled', 'Requires Manual Action'].includes(p.status) && (
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => void run('publication.cancel', { id: p.id }).catch(() => {})}
        >
          Cancel publication
        </Button>
      )}
    </div>
  );
}
export function Calendar(props: WorkspaceProps) {
  const { state, run, busy } = props;
  const [view, setView] = useState('week');
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10));
  const [reschedule, setReschedule] = useState<string | null>(null);
  const [portal, setPortal] = useState('all');
  const start = new Date(`${anchor}T00:00:00+06:00`);
  const count = view === 'day' ? 1 : view === 'week' ? 7 : 31;
  const days = Array.from({ length: count }, (_, i) => new Date(start.getTime() + i * 86400000));
  const toDate = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  function move(direction: number) {
    const d = new Date(start.getTime() + direction * count * 86400000);
    setAnchor(toDate(d));
  }
  return (
    <>
      <div className="section-toolbar">
        <div className="button-row">
          <Button variant="outline" onClick={() => move(-1)} aria-label="Previous period">
            <ChevronLeft size={16} />
          </Button>
          <input
            type="date"
            aria-label="Calendar start date"
            value={anchor}
            onChange={(e) => setAnchor(e.target.value)}
          />
          <Button variant="outline" onClick={() => move(1)} aria-label="Next period">
            <ChevronRight size={16} />
          </Button>
        </div>
        <div className="button-row">
          <select
            aria-label="Calendar portal"
            value={portal}
            onChange={(e) => setPortal(e.target.value)}
          >
            <option value="all">All portals</option>
            {state.portals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="segmented">
            {['day', 'week', 'month'].map((v) => (
              <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="notice">
        <CalendarDays size={17} />
        <span>
          Drag a scheduled card to another day, then confirm its Dhaka time. The server worker
          processes due jobs even when the browser is closed. Providers remain manual until
          validated.
        </span>
      </div>
      <div className={`calendar-grid ${view === 'day' ? 'day-view' : ''}`}>
        {days.map((day) => {
          const date = toDate(day);
          return (
            <div
              className="calendar-day"
              key={date}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                setReschedule(`${e.dataTransfer.getData('text/plain')}|${date}`);
              }}
            >
              <div className="calendar-day-label">
                <b>
                  {new Intl.DateTimeFormat('en-GB', {
                    timeZone: 'Asia/Dhaka',
                    weekday: 'short',
                  }).format(day)}
                </b>
                <span>{date.slice(8)}</span>
              </div>
              {state.publications
                .filter(
                  (p) =>
                    p.scheduledAt &&
                    toDate(new Date(p.scheduledAt)) === date &&
                    (portal === 'all' ||
                      state.editions.find((e) => e.id === p.editionId)?.portalId === portal)
                )
                .map((p) => {
                  const e = state.editions.find((e) => e.id === p.editionId)!;
                  const brand = state.portals.find((x) => x.id === e.portalId)!;
                  return (
                    <button
                      key={p.id}
                      className="calendar-card"
                      style={{ borderLeftColor: brand.color }}
                      draggable={p.status === 'Scheduled'}
                      onDragStart={(ev) => ev.dataTransfer.setData('text/plain', p.id)}
                      onClick={() => setReschedule(`${p.id}|${date}`)}
                    >
                      <small>{localTime(p.scheduledAt)}</small>
                      <b>{e.content.headlineEn}</b>
                      <span>
                        {brand.name} · {p.status}
                      </span>
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>
      {!state.publications.length && (
        <p className="calendar-empty">
          No scheduled posts. Approve an edition in AI Studio, then choose a publishing time.
        </p>
      )}
      <Dialog
        open={!!reschedule}
        onClose={() => setReschedule(null)}
        title="Reschedule publication"
      >
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run('publication.reschedule', {
              id: reschedule?.split('|')[0],
              localTime: f.get('localTime'),
            })
              .then(() => setReschedule(null))
              .catch(() => {});
          }}
        >
          <label>
            New date & time (Asia/Dhaka)
            <input
              type="datetime-local"
              required
              name="localTime"
              defaultValue={reschedule ? `${reschedule.split('|')[1]}T12:00` : ''}
            />
          </label>
          <p>
            Only queued, scheduled publications can be moved. The server checks destination time
            conflicts.
          </p>
          <Button disabled={busy}>Confirm new schedule</Button>
        </form>
      </Dialog>
    </>
  );
}
export function Published(props: WorkspaceProps) {
  const posts = props.state.publications;
  return posts.length ? (
    <div className="cards-grid">
      {[...posts].reverse().map((p) => (
        <div className="panel publication-card" key={p.id}>
          <h3>{props.state.editions.find((e) => e.id === p.editionId)?.content.headlineEn}</h3>
          <PublicationItem {...props} publication={p} />
        </div>
      ))}
    </div>
  ) : (
    <section className="panel empty-state tall">
      <Send size={32} />
      <h2>A record you can trust.</h2>
      <p>
        Actual post links and statuses will appear here. The platform never marks a post published
        without an external result or an explicitly labeled editor report.
      </p>
    </section>
  );
}
