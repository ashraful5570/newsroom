import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  type State,
  type Job,
  id,
  sourceSchema,
  portalSchema,
  templateSchema,
  factSchema,
  contentSchema,
} from './schema';
import { type Context, assertOwner, assertWrite } from './auth';
import { transact, readState, event } from './store';
import {
  ingest,
  checkLock,
  invalidate,
  manualContent,
  validateContent,
  canApprove,
  dhakaToUtc,
  discoverFeeds,
} from './editorial';
import { testIntegration, providerConfig, canvaRequest, canvaDataset } from './integrations';
import { safeGet, sanitizeText, encrypt } from './security';
export function enqueue(
  state: State,
  type: Job['type'],
  payload: Job['payload'],
  key: string,
  runAt = new Date().toISOString()
) {
  const old = state.jobs.find((j) => j.idempotencyKey === key);
  if (old) return old;
  const now = new Date().toISOString();
  const job: Job = {
    id: randomUUID(),
    type,
    status: 'queued',
    payload,
    idempotencyKey: key,
    attempts: 0,
    runAt,
    leaseUntil: null,
    leaseToken: null,
    progress: 0,
    message: 'Queued',
    createdAt: now,
    updatedAt: now,
  };
  state.jobs.unshift(job);
  return job;
}
export async function command(ctx: Context, action: string, input: Record<string, unknown>) {
  assertWrite(ctx);
  const itemId = () => id.parse(input.id);
  if (
    [
      'source.save',
      'source.delete',
      'portal.save',
      'portal.delete',
      'template.save',
      'template.delete',
      'connection.test',
      'connection.disconnect',
      'workspace.save',
      'suggestion.decide',
      'canva.templates',
      'canva.dataset',
      'connection.destination.save',
    ].includes(action)
  )
    assertOwner(ctx);
  if (action === 'source.findFeeds') {
    const url = z.url().parse(input.url);
    return { feeds: await discoverFeeds(url) };
  }
  if (action === 'evidence.retrieve') {
    const url = z.url().parse(input.url);
    const page = await safeGet(url);
    const evidence = {
      id: randomUUID(),
      url: page.url,
      excerpt: sanitizeText(page.body).slice(0, 5000),
      retrievedAt: new Date().toISOString(),
    };
    await transact(ctx.workspaceId, (s) => {
      s.retrievedEvidence.push(evidence);
    });
    return evidence;
  }
  if (action === 'connection.test') {
    const provider = z
      .enum(['openai', 'supabase', 'canva', 'meta', 'buffer'])
      .parse(input.provider);
    const state = await readState(ctx.workspaceId);
    try {
      const result = await testIntegration(provider, state);
      await transact(ctx.workspaceId, (s) => {
        const c = s.connections.find((c) => c.provider === provider)!;
        c.status = 'Connected';
        c.lastSuccess = new Date().toISOString();
        c.lastError = null;
        c.permissions = result.permissions;
        c.accountId = result.accountId;
        const token = process.env[`${provider.toUpperCase()}_ACCESS_TOKEN`];
        if (token && !c.tokenEncrypted) c.tokenEncrypted = encrypt(token);
        event(s, `${provider} connection test succeeded.`, ctx.actor);
      });
      return { message: 'Live connection test succeeded.' };
    } catch (e) {
      await transact(ctx.workspaceId, (s) => {
        const c = s.connections.find((c) => c.provider === provider)!;
        c.status = 'Error';
        c.lastError = e instanceof Error ? e.message : 'Test failed';
      });
      throw e;
    }
  }
  if (action === 'canva.templates') {
    const state = await readState(ctx.workspaceId);
    const config = providerConfig('canva');
    if (!config.brandTemplatesPath)
      throw new Error('Brand Template listing is unavailable in the verified provider contract.');
    return { result: await canvaRequest(state, config.brandTemplatesPath) };
  }
  if (action === 'canva.dataset') {
    const state = await readState(ctx.workspaceId);
    const template = state.templates.find((t) => t.id === itemId());
    if (!template) throw new Error('Template not found.');
    return { result: await canvaDataset(state, template) };
  }
  return transact(ctx.workspaceId, (state) => {
    const story = () => {
      const s = state.stories.find((s) => s.id === itemId());
      if (!s) throw new Error('Story not found.');
      return s;
    };
    const edition = () => {
      const e = state.editions.find((e) => e.id === itemId());
      if (!e) throw new Error('Edition not found.');
      return e;
    };
    switch (action) {
      case 'workspace.save': {
        const data = z
          .object({
            name: z.string().min(2).max(100),
            onboardingStep: z.number().int().min(0).max(10),
            onboarded: z.boolean(),
            budgetUsd: z.number().nonnegative().max(100000),
            generationPreferences: z.string().max(3000),
          })
          .parse(input);
        Object.assign(state.workspace, data);
        event(state, 'Workspace preferences updated.', ctx.actor);
        break;
      }
      case 'source.save': {
        const data = sourceSchema.parse(input);
        if (data.ingestionPolicy === 'public-extraction' && !data.reliability.trim())
          throw new Error('Record the owner permission reference before public extraction.');
        if (
          data.enabled &&
          (!data.url || (data.sourceType === 'facebook' && data.ingestionPolicy !== 'manual'))
        )
          throw new Error(
            'Confirm the URL; Facebook sources use manual import until official retrieval is implemented.'
          );
        if (
          data.enabled &&
          ['rss', 'atom'].includes(data.sourceType) &&
          data.ingestionPolicy !== 'feed'
        )
          throw new Error('Feeds require the feed ingestion policy.');
        const index = state.sources.findIndex((s) => s.id === data.id);
        if (index >= 0) state.sources[index] = data;
        else state.sources.push(data);
        event(state, `Source saved: ${data.name}`, ctx.actor);
        break;
      }
      case 'source.delete': {
        const sid = itemId();
        if (
          state.stories.some((s) => s.sourceId === sid) ||
          state.sourceItems.some((s) => s.sourceId === sid)
        )
          throw new Error(
            'Source has attributed stories. Disable it instead to preserve attribution.'
          );
        state.sources = state.sources.filter((s) => s.id !== sid);
        break;
      }
      case 'portal.save': {
        const data = portalSchema.parse(input);
        if (state.portals.some((p) => p.slug === data.slug && p.id !== data.id))
          throw new Error('Portal slug already exists.');
        for (const tid of data.templateIds)
          if (!state.templates.some((t) => t.id === tid)) throw new Error('Unknown template.');
        const index = state.portals.findIndex((p) => p.id === data.id);
        if (index >= 0) state.portals[index] = data;
        else state.portals.push(data);
        for (const t of state.templates) {
          t.portalIds = t.portalIds.filter((pid) => pid !== data.id);
          if (data.templateIds.includes(t.id)) t.portalIds.push(data.id);
        }
        break;
      }
      case 'portal.delete': {
        if (state.editions.some((e) => e.portalId === itemId()))
          throw new Error('Portal contains editions and must be retained.');
        state.portals = state.portals.filter((p) => p.id !== itemId());
        break;
      }
      case 'template.save': {
        const data = templateSchema.parse(input);
        if (data.margin * 2 >= Math.min(data.width, data.height))
          throw new Error('Margins exceed the canvas.');
        for (const pid of data.portalIds)
          if (!state.portals.some((p) => p.id === pid))
            throw new Error('Unknown portal assignment.');
        data.eligible = false;
        data.status =
          data.kind === 'fallback'
            ? 'Built-in renderer ready'
            : 'Registration only; validate authorized capabilities';
        if (data.kind !== 'fallback' && !data.reference)
          throw new Error('A Canva design or Brand Template reference is required.');
        const index = state.templates.findIndex((t) => t.id === data.id);
        if (index >= 0) state.templates[index] = data;
        else state.templates.push(data);
        for (const p of state.portals) {
          p.templateIds = p.templateIds.filter((t) => t !== data.id);
          if (data.portalIds.includes(p.id)) p.templateIds.push(data.id);
        }
        break;
      }
      case 'template.delete': {
        const tid = itemId();
        if (state.media.some((m) => m.templateId === tid))
          throw new Error('Template has generated assets; retain it for provenance.');
        state.templates = state.templates.filter((t) => t.id !== tid);
        for (const p of state.portals) p.templateIds = p.templateIds.filter((t) => t !== tid);
        break;
      }
      case 'suggestion.decide': {
        const decision = z.enum(['added', 'rejected']).parse(input.decision);
        const suggestion = state.suggestions.find((s) => s.id === itemId());
        if (!suggestion) throw new Error('Suggestion not found.');
        if (suggestion.decision !== 'pending') throw new Error('Suggestion already reviewed.');
        suggestion.decision = decision;
        if (decision === 'added')
          state.sources.push({
            id: randomUUID(),
            name: suggestion.name,
            url: suggestion.url,
            sourceType: 'website',
            language: suggestion.language,
            country: '',
            category: suggestion.category,
            priority: 2,
            enabled: false,
            maxStories: 20,
            ingestionPolicy: 'manual',
            status: 'Feed discovery required',
            lastCheckedAt: null,
            lastSuccessAt: null,
            failures: [],
            reliability: suggestion.reason,
          });
        break;
      }
      case 'story.import': {
        const data = z
          .object({
            sourceId: id,
            title: z.string().min(3).max(1000),
            url: z.url(),
            body: z.string().min(10).max(100000),
            publishedAt: z.string().optional(),
          })
          .parse(input);
        if (new URL(data.url).protocol !== 'https:')
          throw new Error('Use a public HTTPS source URL.');
        const source = state.sources.find((s) => s.id === data.sourceId);
        if (!source) throw new Error('Select a source.');
        const added = ingest(state, source, data, true);
        event(
          state,
          added ? `Manually imported: ${data.title}` : 'Duplicate import ignored.',
          ctx.actor
        );
        break;
      }
      case 'story.select': {
        story().selected = z.boolean().parse(input.selected);
        break;
      }
      case 'story.queue': {
        for (const s of state.stories.filter((s) => z.array(id).parse(input.ids).includes(s.id)))
          s.selected = true;
        event(state, 'Stories added to editorial queue.', ctx.actor);
        break;
      }
      case 'facts.save': {
        const s = story();
        const data = factSchema.parse(input.facts);
        for (const c of data.claims)
          for (const e of c.evidence)
            if (
              e.retrievedAt &&
              !state.retrievedEvidence.some(
                (r) => r.url === e.url && r.excerpt === e.excerpt && r.retrievedAt === e.retrievedAt
              )
            )
              throw new Error(
                'Retrieved evidence must match a server-recorded retrieval. Edited excerpts are manual evidence.'
              );
        if (s.facts.version !== z.number().parse(input.expectedVersion))
          throw new Error('Facts changed in another session. Refresh and review.');
        state.factRevisions.push({
          id: randomUUID(),
          storyId: s.id,
          facts: structuredClone(s.facts),
          actor: ctx.actor,
          at: new Date().toISOString(),
        });
        data.version = s.facts.version + 1;
        data.locked = false;
        data.lockedAt = null;
        data.lockedBy = null;
        invalidate(state, s.id);
        s.facts = data;
        event(state, 'Fact record revised; downstream approvals invalidated.', ctx.actor);
        break;
      }
      case 'facts.lock': {
        const s = story();
        checkLock(s.facts);
        s.facts.locked = true;
        s.facts.lockedAt = new Date().toISOString();
        s.facts.lockedBy = ctx.actor;
        event(
          state,
          'Editor locked the factual record. This is an editorial decision, not proof of verification.',
          ctx.actor
        );
        break;
      }
      case 'discovery.start': {
        if (
          state.jobs.some((j) => j.type === 'discovery' && ['queued', 'running'].includes(j.status))
        )
          throw new Error('A discovery job is already active.');
        enqueue(state, 'discovery', {}, `discovery:${randomUUID()}`);
        event(state, 'Discovery requested.', ctx.actor);
        break;
      }
      case 'edition.generate': {
        const sid = id.parse(input.storyId);
        const s = state.stories.find((s) => s.id === sid);
        if (!s?.facts.locked) throw new Error('Review and lock facts before generation.');
        const portals = z.array(id).min(1).parse(input.portalIds);
        const mode = z.enum(['openai', 'manual']).parse(input.mode);
        if (
          mode === 'openai' &&
          !state.connections.some((c) => c.provider === 'openai' && c.status === 'Connected')
        )
          throw new Error('Test the OpenAI connection first, or create a manual bilingual draft.');
        for (const pid of portals) {
          const p = state.portals.find((p) => p.id === pid);
          if (!p) throw new Error('Unknown portal.');
          const active = state.editions.find((e) => e.storyId === sid && e.portalId === pid);
          if (active)
            throw new Error(`${p.name} already has an edition. Edit it to preserve history.`);
          if (mode === 'openai')
            enqueue(
              state,
              'generate',
              { storyId: sid, portalId: pid, factVersion: s.facts.version },
              `generate:${sid}:${pid}:${s.facts.version}`
            );
          else {
            const now = new Date().toISOString();
            state.editions.push({
              id: randomUUID(),
              storyId: sid,
              portalId: pid,
              factVersion: s.facts.version,
              content: manualContent(s, p),
              status: 'Draft',
              flags: [],
              aiChecked: false,
              approvedBy: null,
              approvedAt: null,
              designAssetId: null,
              imageAssetId: null,
              createdAt: now,
              updatedAt: now,
              revision: 1,
              generationMode: 'manual',
              comment: '',
            });
          }
        }
        break;
      }
      case 'edition.regenerate': {
        const e = edition();
        const story = state.stories.find((s) => s.id === e.storyId)!;
        if (!story.facts.locked) throw new Error('Lock the factual record before regeneration.');
        if (['Published', 'Publishing'].includes(e.status))
          throw new Error('Published editions cannot be regenerated.');
        if (!state.connections.some((c) => c.provider === 'openai' && c.status === 'Connected'))
          throw new Error('Test the OpenAI connection first. Manual editing remains available.');
        const part = z.enum(['headlines', 'articles', 'caption', 'all']).parse(input.part);
        if (e.revision !== z.number().parse(input.expectedRevision))
          throw new Error('Edition changed. Refresh before regeneration.');
        if (
          state.jobs.some(
            (j) =>
              j.type === 'generate' &&
              j.payload.editionId === e.id &&
              ['queued', 'running'].includes(j.status)
          )
        )
          throw new Error('A regeneration job is already active.');
        e.approvedAt = null;
        e.approvedBy = null;
        e.status = 'Awaiting Review';
        for (const p of state.publications.filter(
          (p) => p.editionId === e.id && p.status === 'Scheduled'
        )) {
          p.status = 'Failed';
          const job = state.jobs.find((j) => j.id === p.jobId);
          if (job) job.status = 'cancelled';
        }
        enqueue(
          state,
          'generate',
          {
            storyId: story.id,
            portalId: e.portalId,
            factVersion: story.facts.version,
            editionId: e.id,
            revision: e.revision,
            part,
          },
          `regenerate:${e.id}:${e.revision}:${part}`
        );
        break;
      }
      case 'edition.save': {
        const e = edition();
        if (['Published', 'Publishing'].includes(e.status))
          throw new Error('Published or in-flight content cannot be edited.');
        if (e.revision !== z.number().parse(input.expectedRevision))
          throw new Error('Edition changed in another session. Refresh before editing.');
        const content = contentSchema.parse(input.content);
        const s = state.stories.find((s) => s.id === e.storyId)!;
        state.revisions.push({
          id: randomUUID(),
          editionId: e.id,
          version: e.revision,
          content: e.content,
          actor: ctx.actor,
          createdAt: new Date().toISOString(),
        });
        e.content = content;
        e.comment = z
          .string()
          .max(50000)
          .parse(input.comment || '');
        e.revision++;
        e.updatedAt = new Date().toISOString();
        e.approvedAt = null;
        e.approvedBy = null;
        e.status = 'Awaiting Review';
        e.aiChecked = false;
        e.flags = validateContent(content, s.facts);
        e.factVersion = s.facts.version;
        e.designAssetId = null;
        for (const p of state.publications.filter(
          (p) => p.editionId === e.id && p.status === 'Scheduled'
        )) {
          p.status = 'Failed';
          const j = state.jobs.find((j) => j.id === p.jobId);
          if (j) {
            j.status = 'cancelled';
            j.message = 'Edition revised; approval invalidated.';
          }
        }
        break;
      }
      case 'edition.approve': {
        const e = edition();
        const s = state.stories.find((s) => s.id === e.storyId)!;
        e.flags = validateContent(e.content, s.facts);
        canApprove(e, s);
        if (input.reviewConfirmed !== true)
          throw new Error(
            'Confirm that you reviewed identities, dates, quotes, both languages and source attribution.'
          );
        e.status = 'Approved';
        e.approvedBy = ctx.actor;
        e.approvedAt = new Date().toISOString();
        event(state, 'Edition approved after human review.', ctx.actor);
        break;
      }
      case 'edition.reject': {
        const e = edition();
        if (e.status === 'Publishing' || e.status === 'Published')
          throw new Error('Publication is already in flight or completed.');
        e.status = 'Draft';
        e.approvedAt = null;
        e.approvedBy = null;
        for (const p of state.publications.filter(
          (p) => p.editionId === e.id && p.status === 'Scheduled'
        )) {
          p.status = 'Failed';
          const j = state.jobs.find((j) => j.id === p.jobId);
          if (j) j.status = 'cancelled';
        }
        break;
      }
      case 'design.generate': {
        const e = edition();
        const tid = id.parse(input.templateId);
        const t = state.templates.find((t) => t.id === tid);
        if (!t) throw new Error('Register a template first.');
        if (t.portalIds.length && !t.portalIds.includes(e.portalId))
          throw new Error('This template is assigned to a different portal.');
        enqueue(
          state,
          'design',
          { editionId: e.id, templateId: tid, revision: e.revision },
          `design:${e.id}:${tid}:${e.revision}:${randomUUID()}`
        );
        break;
      }
      case 'media.select': {
        const e = edition();
        if (e.status === 'Published' || e.status === 'Publishing')
          throw new Error('Cannot change imagery after publishing starts.');
        const assetId = id.parse(input.assetId);
        const m = state.media.find((m) => m.id === assetId);
        if (!m?.rights.approved || !m.rights.license || !m.rights.allowedUses)
          throw new Error('Approve rights and allowed uses first.');
        if (m.rights.expiresAt && new Date(m.rights.expiresAt).getTime() <= Date.now())
          throw new Error('Image license has expired.');
        e.imageAssetId = assetId;
        e.designAssetId = null;
        e.approvedAt = null;
        e.approvedBy = null;
        e.status = 'Awaiting Review';
        break;
      }
      case 'media.rights': {
        const m = state.media.find((m) => m.id === itemId());
        if (!m) throw new Error('Asset not found.');
        const rights = z
          .object({
            source: z.string().min(1),
            license: z.string().min(1),
            attribution: z.string(),
            allowedUses: z.string().min(1),
            expiresAt: z.string().nullable(),
            approved: z.boolean(),
            illustration: z.boolean(),
          })
          .parse(input.rights);
        m.rights = rights;
        m.focalX = z.number().min(0).max(1).parse(input.focalX);
        m.focalY = z.number().min(0).max(1).parse(input.focalY);
        m.approved = false;
        for (const e of state.editions.filter((e) => e.imageAssetId === m.id)) {
          if (e.status === 'Publishing') throw new Error('Cannot change in-flight image rights.');
          if (e.status !== 'Published') {
            e.designAssetId = null;
            e.approvedAt = null;
            e.approvedBy = null;
            e.status = 'Awaiting Review';
          }
        }
        break;
      }
      case 'media.approve': {
        const m = state.media.find((m) => m.id === itemId());
        if (!m) throw new Error('Asset not found.');
        if (!m.rights.approved) throw new Error('Resolve image rights first.');
        m.approved = z.boolean().parse(input.approved);
        break;
      }
      case 'publication.schedule': {
        const e = edition();
        if (e.status !== 'Approved')
          throw new Error('Only an approved edition can be published or scheduled.');
        if (e.designAssetId && !state.media.find((m) => m.id === e.designAssetId)?.approved)
          throw new Error('Review and approve the graphic first.');
        const destinations = input.destinationIds
          ? z.array(id).min(1).max(20).parse(input.destinationIds)
          : [id.parse(input.destinationId)];
        for (const destinationId of [...new Set(destinations)]) {
          const c = state.connections.find((c) => c.id === destinationId);
          if (!c || !['meta', 'buffer'].includes(c.provider))
            throw new Error('Select a publishing destination.');
          const when = input.localTime
            ? dhakaToUtc(z.string().parse(input.localTime))
            : new Date().toISOString();
          if (input.localTime && new Date(when).getTime() < Date.now() + 30000)
            throw new Error('Schedule at least 30 seconds in the future.');
          if (
            state.publications.some(
              (p) =>
                p.editionId === e.id &&
                p.destinationId === destinationId &&
                state.jobs.find((j) => j.id === p.jobId)?.payload.revision === e.revision
            )
          )
            throw new Error('This edition already has a publication for this destination.');
          if (
            state.publications.some(
              (p) =>
                p.destinationId === destinationId &&
                p.scheduledAt &&
                Math.abs(new Date(p.scheduledAt).getTime() - new Date(when).getTime()) < 60000 &&
                p.status === 'Scheduled'
            )
          )
            throw new Error('A post already occupies this destination within one minute.');
          const pubId = randomUUID();
          const job = enqueue(
            state,
            'publish',
            { publicationId: pubId, editionId: e.id, revision: e.revision },
            `publish:${e.id}:${destinationId}:${e.revision}`,
            when
          );
          state.publications.push({
            id: pubId,
            editionId: e.id,
            destinationId,
            jobId: job.id,
            status: input.localTime ? 'Scheduled' : 'Requires Manual Action',
            scheduledAt: input.localTime ? when : null,
            externalId: null,
            externalUrl: null,
            response: null,
            createdAt: new Date().toISOString(),
            commentStatus: 'Manual comment required unless supported permissions are verified.',
          });
        }
        e.status = input.localTime ? 'Scheduled' : 'Requires Manual Action';
        break;
      }
      case 'publication.reschedule': {
        const p = state.publications.find((p) => p.id === itemId());
        if (!p || p.status !== 'Scheduled')
          throw new Error('Only scheduled publications can move.');
        const runAt = dhakaToUtc(z.string().parse(input.localTime));
        if (new Date(runAt).getTime() < Date.now() + 30000)
          throw new Error('Select a future time.');
        if (
          state.publications.some(
            (q) =>
              q.id !== p.id &&
              q.destinationId === p.destinationId &&
              q.status === 'Scheduled' &&
              q.scheduledAt &&
              Math.abs(new Date(q.scheduledAt).getTime() - new Date(runAt).getTime()) < 60000
          )
        )
          throw new Error('Destination time conflict.');
        const j = state.jobs.find((j) => j.id === p.jobId)!;
        if (j.status !== 'queued')
          throw new Error('The worker has already claimed this publication.');
        j.runAt = runAt;
        p.scheduledAt = runAt;
        break;
      }
      case 'publication.cancel': {
        const p = state.publications.find((p) => p.id === itemId());
        if (!p || !['Scheduled', 'Requires Manual Action'].includes(p.status))
          throw new Error('This publication cannot be cancelled.');
        const j = state.jobs.find((j) => j.id === p.jobId)!;
        if (j.status === 'running') throw new Error('Worker is processing this job.');
        j.status = 'cancelled';
        p.status = 'Failed';
        p.response = 'Cancelled by editor';
        const e = state.editions.find((e) => e.id === p.editionId)!;
        e.status = 'Approved';
        break;
      }
      case 'publication.reconcile': {
        const p = state.publications.find((p) => p.id === itemId());
        const j = state.jobs.find((j) => j.id === p?.jobId);
        if (!p || !j || j.status !== 'ambiguous')
          throw new Error('This job is not awaiting reconciliation.');
        if (input.destinationReviewed !== true)
          throw new Error(
            'Review the destination platform before resolving the ambiguous outcome.'
          );
        const e = state.editions.find((e) => e.id === p.editionId)!;
        if (!e.approvedAt) throw new Error('Reapprove the current edition first.');
        p.status = 'Requires Manual Action';
        p.response =
          'Editor reviewed the external destination. Record an existing post URL, or publish manually after confirming no existing post. No automatic retry was made.';
        j.status = 'manual';
        j.message = p.response;
        event(state, p.response, ctx.actor);
        break;
      }
      case 'publication.record': {
        const p = state.publications.find((p) => p.id === itemId());
        if (!p || p.status !== 'Requires Manual Action')
          throw new Error('Publication is not awaiting manual action.');
        const url = z.url().parse(input.url);
        const u = new URL(url);
        if (
          u.protocol !== 'https:' ||
          !['www.facebook.com', 'facebook.com', 'www.instagram.com', 'instagram.com'].includes(
            u.hostname
          )
        )
          throw new Error('Provide the actual Facebook or Instagram HTTPS post URL.');
        p.externalUrl = url;
        p.externalId = z.string().min(1).max(300).parse(input.externalId);
        p.status = 'Published';
        p.response = 'Manually published; URL and ID supplied by editor, not API-verified.';
        const e = state.editions.find((e) => e.id === p.editionId)!;
        if (!e.approvedAt) throw new Error('Edition approval is no longer valid.');
        e.status = state.publications
          .filter((p) => p.editionId === e.id)
          .every((p) => p.status === 'Published')
          ? 'Published'
          : 'Partially Published';
        const j = state.jobs.find((j) => j.id === p.jobId);
        if (j) {
          j.status = 'succeeded';
          j.message = p.response;
          j.progress = 100;
        }
        event(state, 'Editor recorded manual publication (not API-verified).', ctx.actor);
        break;
      }
      case 'connection.destination.save': {
        const data = z
          .object({
            name: z.string().min(2).max(100),
            provider: z.enum(['meta', 'buffer']),
            accountId: z.string().min(1).max(500),
          })
          .parse(input);
        state.connections.push({
          id: randomUUID(),
          ...data,
          status: 'Disconnected',
          lastSuccess: null,
          lastError: null,
          permissions: ['Manual destination reference only; no account authorization is claimed.'],
          tokenEncrypted: null,
        });
        break;
      }
      case 'connection.disconnect': {
        const c = state.connections.find((c) => c.id === itemId());
        if (!c) throw new Error('Connection not found.');
        c.status = 'Disconnected';
        c.tokenEncrypted = null;
        c.permissions = [];
        event(
          state,
          `${c.provider} disconnected locally; revoke remote access in the provider account if needed.`,
          ctx.actor
        );
        break;
      }
      case 'job.retry': {
        const j = state.jobs.find((j) => j.id === itemId());
        if (!j || !['failed', 'dead'].includes(j.status) || j.type === 'publish')
          throw new Error(
            'Only resolved non-publication failures can be retried. Ambiguous publication outcomes require reconciliation.'
          );
        j.status = 'queued';
        j.attempts = 0;
        j.runAt = new Date().toISOString();
        break;
      }
      default:
        throw new Error('Unknown command.');
    }
    return { message: 'Saved' };
  });
}
