'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { createBrowserClient } from '@supabase/ssr';
import {
  Check,
  ArrowRight,
  ArrowLeft,
  Link2,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  Globe,
  PanelsTopLeft,
  Send,
  Compass,
  FileText,
  KeyRound,
  LogOut,
} from 'lucide-react';
import { localTime } from '@/lib/utils';
import type { WorkspaceProps, View } from './types';
import { Button } from './ui/button';
export function IntegrationSettings({
  state,
  run,
  busy,
  sandbox,
  onSetup,
}: WorkspaceProps & { sandbox: boolean; onSetup: () => void }) {
  const [tab, setTab] = useState('integrations');
  async function connect(provider: string) {
    try {
      const r = await fetch(`/api/oauth/${provider}/start?prepare=1`);
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      location.assign(b.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to begin OAuth');
    }
  }
  return (
    <>
      <div className="tabs">
        {['integrations', 'workspace', 'jobs', 'security'].map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'integrations' && (
        <>
          <div className="notice">
            <KeyRound size={18} />
            <span>
              Secrets are configured securely on the server or exchanged through OAuth. Never paste
              API keys into articles or source settings. A connection is shown as connected only
              after a successful live test.
            </span>
          </div>
          <div className="integration-grid">
            {state.connections
              .filter((c, i, a) => a.findIndex((x) => x.provider === c.provider) === i)
              .map((c) => (
                <section className="panel integration-card" key={c.id}>
                  <div className="integration-card-heading">
                    <span className={`integration-logo ${c.provider}`}>
                      {c.provider === 'openai' ? (
                        <Sparkles size={24} />
                      ) : c.provider === 'canva' ? (
                        'C'
                      ) : c.provider === 'meta' ? (
                        '∞'
                      ) : c.provider === 'buffer' ? (
                        '▱'
                      ) : (
                        'ϟ'
                      )}
                    </span>
                    <span
                      className={`pill ${c.status === 'Connected' ? 'pill-success' : c.status === 'Error' ? 'pill-error' : ''}`}
                    >
                      <span
                        className={
                          c.status === 'Connected'
                            ? 'green-dot'
                            : c.status === 'Error'
                              ? 'red-dot'
                              : 'gray-dot'
                        }
                      />
                      {c.status}
                    </span>
                  </div>
                  <h2>{providerNames[c.provider]}</h2>
                  <p>{providerDescriptions[c.provider]}</p>
                  <div className="integration-detail">
                    <b>Permission requirements</b>
                    <small>{providerPermissions[c.provider]}</small>
                  </div>
                  <div className="integration-detail">
                    <b>Last successful call</b>
                    <small>
                      {c.lastSuccess ? localTime(c.lastSuccess) : 'No successful live test'}
                    </small>
                  </div>
                  {c.lastError && <div className="error-text">{c.lastError}</div>}
                  {c.permissions.length > 0 && <small>{c.permissions.join(' · ')}</small>}
                  <div className="button-row">
                    {['canva', 'meta', 'buffer'].includes(c.provider) && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => void connect(c.provider)}
                      >
                        <Link2 size={14} />
                        Connect
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run('connection.test', { provider: c.provider }).catch(() => {})
                      }
                    >
                      <RefreshCw size={14} />
                      Test connection
                    </Button>
                    {c.status !== 'Disconnected' && (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void run('connection.disconnect', { id: c.id }).catch(() => {})
                        }
                      >
                        Disconnect
                      </Button>
                    )}
                  </div>
                </section>
              ))}
          </div>
          <section className="panel settings-panel destination-settings">
            <h2>Publishing destination references</h2>
            <p>
              Add destinations without changing source code. A saved reference is not an authorized
              API connection; it supports the manual workflow until account-specific API
              authorization is available.
            </p>
            <div className="destination-list">
              {state.connections
                .filter((c) => c.provider === 'meta' || c.provider === 'buffer')
                .map((c) => (
                  <div key={c.id}>
                    <b>{c.name}</b>
                    <small>
                      {c.accountId || 'No account identifier supplied'} · {c.status}
                    </small>
                  </div>
                ))}
            </div>
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run('connection.destination.save', {
                  name: f.get('name'),
                  provider: f.get('provider'),
                  accountId: f.get('accountId'),
                })
                  .then(() =>
                    toast.success(
                      'Manual destination reference saved. No API connection is implied.'
                    )
                  )
                  .catch(() => {});
              }}
            >
              <div className="form-grid">
                <label>
                  Destination name
                  <input name="name" required minLength={2} placeholder="InfoGram Facebook Page" />
                </label>
                <label>
                  Provider
                  <select name="provider">
                    <option value="meta">Meta — Facebook / Instagram</option>
                    <option value="buffer">Buffer</option>
                  </select>
                </label>
              </div>
              <label>
                Actual account ID or official destination URL
                <input
                  name="accountId"
                  required
                  placeholder="Your confirmed Page ID or official account URL"
                />
              </label>
              <Button disabled={busy}>Add manual destination reference</Button>
            </form>
          </section>
          <div className="panel documentation-note">
            <ShieldCheck size={20} />
            <div>
              <h3>Capability checks are intentional.</h3>
              <p>
                Current official API documentation was blocked by the setup network policy. Canva,
                Meta, and Buffer contracts are disabled until a deployer verifies the current
                official documentation, configures the adapter contract, and completes authorized
                connectivity tests. Manual editorial and publishing workflows remain available.
              </p>
            </div>
          </div>
        </>
      )}
      {tab === 'workspace' && (
        <section className="panel settings-panel">
          <h2>Workspace preferences</h2>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run('workspace.save', {
                ...state.workspace,
                name: f.get('name'),
                budgetUsd: Number(f.get('budgetUsd')),
                generationPreferences: f.get('generationPreferences'),
              }).catch(() => {});
            }}
          >
            <label>
              Workspace name
              <input name="name" required minLength={2} defaultValue={state.workspace.name} />
            </label>
            <label>
              API usage alert budget (USD)
              <input
                type="number"
                name="budgetUsd"
                min={0}
                step="0.01"
                defaultValue={state.workspace.budgetUsd}
              />
            </label>
            <label>
              Generation preferences / editorial prompt
              <textarea
                name="generationPreferences"
                rows={5}
                defaultValue={state.workspace.generationPreferences}
              />
            </label>
            <p className="muted">
              Pricing must be configured to estimate OpenAI costs. This alert cannot prevent all
              in-flight spend. Configure provider account spending limits.
            </p>
            <Button disabled={busy}>Save preferences</Button>
          </form>
          <Button className="setup-again" variant="outline" onClick={onSetup}>
            Reopen onboarding guide
          </Button>
        </section>
      )}
      {tab === 'jobs' && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Durable job queue</h2>
              <p>
                Run npm run worker on a persistent server. Ambiguous publication outcomes are never
                automatically retried.
              </p>
            </div>
          </div>
          {state.jobs.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>Result / next action</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {state.jobs.map((j) => (
                    <tr key={j.id}>
                      <td>
                        {j.type}
                        <small className="block">{localTime(j.createdAt)}</small>
                      </td>
                      <td>
                        <span className="pill">{j.status}</span>
                      </td>
                      <td>{j.attempts}/3</td>
                      <td>{j.message}</td>
                      <td>
                        {['failed', 'dead'].includes(j.status) && j.type !== 'publish' && (
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => void run('job.retry', { id: j.id }).catch(() => {})}
                          >
                            Retry after fixing cause
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <RefreshCw size={25} />
              <h3>No background jobs yet.</h3>
            </div>
          )}
        </section>
      )}
      {tab === 'security' && (
        <section className="panel settings-panel">
          <ShieldCheck size={28} />
          <h2>Workspace security</h2>
          <div className="security-item">
            <b>Authentication</b>
            <p>
              {sandbox
                ? 'SANDBOX: authentication is bypassed. Keep this mode private and local.'
                : 'Supabase Auth sessions are verified server-side. Workspace membership is checked for every request.'}
            </p>
          </div>
          <div className="security-item">
            <b>Credentials</b>
            <p>
              OAuth access tokens are encrypted with AES-256-GCM and retained server-side. API
              secrets are never returned by the state endpoint. Revoke remote authorization in the
              provider when necessary.
            </p>
          </div>
          <div className="security-item">
            <b>Editorial controls</b>
            <p>
              Source text is untrusted. Fact locks, revision checks, explicit high-risk approval,
              asset review, and human approval precede publishing.
            </p>
          </div>
          <div className="security-item">
            <b>Future subscriptions</b>
            <p>
              Free, Starter, Professional, Agency, and Enterprise are planning concepts only.
              Billing and artificial owner limits are not active.
            </p>
          </div>
          {!sandbox && (
            <Button
              variant="outline"
              onClick={() => {
                const client = createBrowserClient(
                  process.env.NEXT_PUBLIC_SUPABASE_URL!,
                  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                );
                void client.auth.signOut().then(() => location.reload());
              }}
            >
              <LogOut size={15} />
              Sign out
            </Button>
          )}
        </section>
      )}
    </>
  );
}
const providerNames: Record<string, string> = {
  openai: 'OpenAI',
  canva: 'Canva',
  meta: 'Meta',
  buffer: 'Buffer',
  supabase: 'Supabase',
};
const providerDescriptions: Record<string, string> = {
  openai:
    'Structured bilingual drafts and an AI-assisted consistency review. API usage is billed by your provider.',
  canva: 'Authorized designs, eligible Brand Templates, and supported export workflows.',
  meta: 'Supported Facebook Pages and Instagram professional accounts. Manual fallback is always available.',
  buffer:
    'Optional publishing adapter. API availability depends on your account and current supported access.',
  supabase: 'Workspace authentication, PostgreSQL persistence, and production media storage.',
};
const providerPermissions: Record<string, string> = {
  openai: 'Server API key, an accessible model, and separate provider usage limits.',
  canva:
    'OAuth app approval, requested scopes, and eligible template/autofill access. Not every Canva design is eligible.',
  meta: 'Approved app permissions, authorized Page / professional account roles, and verified publishing capability.',
  buffer:
    'Authorized API account access; current publishing contract must be independently verified.',
  supabase:
    'Configured project, email / Google OAuth providers, database migration, and storage policies.',
};
const steps: [string, string, View, typeof Globe][] = [
  [
    'Create your workspace',
    'Give your editorial desk a name. You can change it anytime.',
    'settings',
    Globe,
  ],
  [
    'Shape your news portals',
    'Review the five editable starter brands or create your own.',
    'portals',
    Globe,
  ],
  [
    'Review news sources',
    'Validate permitted feeds before enabling retrieval. No feed URLs are guessed.',
    'sources',
    Compass,
  ],
  [
    'Confirm Facebook pages',
    'Sozoo Today, Cablgram, and Bongo Wiki need their actual official page URLs. Manual import remains available.',
    'sources',
    Link2,
  ],
  [
    'Connect OpenAI',
    'Configure the server API key and model, then run a real connection test. You can edit manually without AI.',
    'settings',
    Sparkles,
  ],
  [
    'Connect Canva, or skip',
    'Authorize an eligible account. You can create original built-in graphics without Canva.',
    'settings',
    Link2,
  ],
  [
    'Add your templates, or skip',
    'No templates were supplied. Register authorized references or add a built-in layout when ready.',
    'templates',
    PanelsTopLeft,
  ],
  [
    'Connect publishing accounts',
    'Review account permissions. Manual publishing lets you complete the workflow without automatic API access.',
    'settings',
    Send,
  ],
  [
    'Run a sample discovery',
    'Add an enabled permitted feed and click Scrape News, or import text you are authorized to use.',
    'discover',
    Compass,
  ],
  [
    'Preview a bilingual edition',
    'Review evidence, lock facts, create English and Bangla drafts, and inspect the result.',
    'studio',
    FileText,
  ],
];
export function Onboarding({
  state,
  run,
  busy,
  navigate,
  onDone,
}: WorkspaceProps & { navigate: (v: View) => void; onDone: () => void }) {
  const [step, setStep] = useState(Math.min(state.workspace.onboardingStep, 9));
  const current = steps[step];
  const Icon = current[3];
  function save(next: number, done = false) {
    return run('workspace.save', {
      ...state.workspace,
      onboardingStep: next,
      onboarded: done,
    }).then(() => {
      if (done) onDone();
      else setStep(Math.min(next, 9));
    });
  }
  return (
    <div className="onboarding">
      <div className="onboarding-steps">
        {steps.map(([title], i) => (
          <button key={title} onClick={() => setStep(i)} className={i === step ? 'active' : ''}>
            <span>{i < step ? <Check size={12} /> : i + 1}</span>
            <b>{title}</b>
          </button>
        ))}
      </div>
      <div className="onboarding-main">
        <span className="eyebrow">STEP {step + 1} OF 10</span>
        <span className="onboarding-step-icon">
          <Icon size={28} />
        </span>
        <h2>{current[0]}</h2>
        <p>{current[1]}</p>
        {step === 0 ? (
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run('workspace.save', {
                ...state.workspace,
                name: f.get('name'),
                onboardingStep: 1,
              })
                .then(() => setStep(1))
                .catch(() => {});
            }}
          >
            <label>
              Workspace name
              <input name="name" required minLength={2} defaultValue={state.workspace.name} />
            </label>
            <Button disabled={busy}>
              Save and continue <ArrowRight size={15} />
            </Button>
          </form>
        ) : (
          <>
            <div className="onboarding-summary">
              {step === 1
                ? `${state.portals.length} starter portals are ready to edit.`
                : step === 2
                  ? `${state.sources.filter((s) => s.sourceType !== 'facebook').length} publisher profiles; ${state.sources.filter((s) => s.enabled).length} sources enabled.`
                  : step === 3
                    ? `${state.sources.filter((s) => s.sourceType === 'facebook' && !s.url).length} Facebook pages awaiting URL confirmation.`
                    : step === 4 || step === 5
                      ? `${state.connections.find((c) => c.provider === (step === 4 ? 'openai' : 'canva'))?.status}. Credentials and permissions are required for live access.`
                      : step === 6
                        ? `${state.templates.length} registered templates. The app remains usable with zero.`
                        : step === 8
                          ? `${state.stories.length} discovered or manually imported stories.`
                          : step === 9
                            ? `${state.editions.length} editions created. Human approval is always required.`
                            : 'No automatic publishing is claimed without a validated provider.'}
            </div>
            <Button variant="outline" onClick={() => navigate(current[2])}>
              Open {current[2] === 'settings' ? 'integration settings' : current[2]}{' '}
              <ArrowRight size={15} />
            </Button>
          </>
        )}
        <div className="onboarding-footer">
          <Button
            variant="ghost"
            disabled={step === 0 || busy}
            onClick={() => void save(step - 1).catch(() => {})}
          >
            <ArrowLeft size={15} />
            Back
          </Button>
          {step === 9 ? (
            <Button disabled={busy} onClick={() => void save(10, true).catch(() => {})}>
              Finish guide <Check size={15} />
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void save(step + 1).catch(() => {})}
            >
              Continue / skip for now <ArrowRight size={15} />
            </Button>
          )}
        </div>
        <small>
          Every step is editable later. Finishing this guide does not certify untested integrations.
        </small>
      </div>
    </div>
  );
}
export function Analytics({ state }: WorkspaceProps) {
  const totals = [
    ['Stories selected', state.stories.filter((s) => s.selected).length],
    ['Articles generated', state.editions.length],
    ['Designs generated', state.media.length],
    [
      'Awaiting approval',
      state.editions.filter((e) => ['Draft', 'Awaiting Review'].includes(e.status)).length,
    ],
    ['Failed publications', state.publications.filter((p) => p.status === 'Failed').length],
    ['API calls recorded', state.usage.length],
  ];
  const totalCost = state.usage.reduce((n, u) => n + (u.estimatedCostUsd || 0), 0);
  return (
    <>
      <div className="metric-grid analytics-metrics">
        {totals.map(([label, value]) => (
          <div className="metric-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>Actual workspace records</small>
          </div>
        ))}
      </div>
      <div className="two-column">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Output by portal</h2>
              <p>Editions created in this workspace.</p>
            </div>
          </div>
          <div className="analytics-bars">
            {state.portals.map((p) => {
              const count = state.editions.filter((e) => e.portalId === p.id).length;
              return (
                <div key={p.id}>
                  <div>
                    <span>{p.name}</span>
                    <b>{count}</b>
                  </div>
                  <div className="bar-track">
                    <span
                      style={{
                        width: `${state.editions.length ? (count / state.editions.length) * 100 : 0}%`,
                        background: p.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <section className="panel settings-panel">
          <h2>API usage & estimates</h2>
          <strong className="cost-number">${totalCost.toFixed(4)}</strong>
          <p>
            {state.usage.filter((u) => u.estimatedCostUsd === null).length} calls have unknown cost.
            Configure model pricing to calculate estimates.
          </p>
          <p>
            {state.usage.reduce((n, u) => n + u.inputTokens, 0).toLocaleString()} input tokens ·{' '}
            {state.usage.reduce((n, u) => n + u.outputTokens, 0).toLocaleString()} output tokens
          </p>
          <small>
            Budget alert: ${state.workspace.budgetUsd}. Provider billing is authoritative; this is
            an estimate.
          </small>
        </section>
      </div>
      <section className="panel empty-state">
        <ShieldCheck size={28} />
        <h3>Engagement data needs authorized metrics.</h3>
        <p>
          Reach, reactions, impressions, and clicks are not displayed because no authorized platform
          analytics response has been retrieved.
        </p>
      </section>
    </>
  );
}
