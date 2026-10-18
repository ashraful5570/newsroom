import { randomUUID } from 'node:crypto';
import { readState, transact, event } from './store';
import type { Job, State } from './schema';
import { fetchSource } from './extraction';
import { ingest, validateContent, mergeRegeneration } from './editorial';
import { generateContent, estimatedCost } from './integrations';
import { renderCard } from './design';
import { log } from './config';
export function retryDelay(attempt: number, random = Math.random()) {
  return Math.min(300000, 1000 * 2 ** attempt) + Math.floor(random * 1000);
}
async function claim(workspaceId: string) {
  return transact(workspaceId, (state) => {
    const now = Date.now();
    for (const j of state.jobs.filter(
      (j) => j.status === 'running' && j.leaseUntil && new Date(j.leaseUntil).getTime() < now
    )) {
      if (j.type === 'publish') {
        j.status = 'ambiguous';
        j.message = 'Worker lease expired. Reconcile external state before any retry.';
        const p = state.publications.find((p) => p.jobId === j.id);
        if (p) {
          p.status = 'Failed';
          p.response = j.message;
        }
      } else {
        j.status = 'queued';
        j.message = 'Recovered expired lease.';
      }
    }
    // One active job per workspace keeps provider concurrency and token reservations bounded.
    if (state.jobs.some((j) => j.status === 'running')) return null;
    const j = state.jobs
      .filter((j) => j.status === 'queued' && new Date(j.runAt).getTime() <= now)
      .sort((a, b) => a.runAt.localeCompare(b.runAt))[0];
    if (!j) return null;
    j.status = 'running';
    j.attempts++;
    j.leaseToken = randomUUID();
    j.leaseUntil = new Date(now + 180000).toISOString();
    j.updatedAt = new Date().toISOString();
    j.message = 'Running';
    return structuredClone(j);
  });
}
async function finish(workspaceId: string, job: Job, mutate: (s: State, j: Job) => void) {
  await transact(workspaceId, (state) => {
    const current = state.jobs.find((j) => j.id === job.id);
    if (!current || current.leaseToken !== job.leaseToken || current.status !== 'running')
      throw new Error('Job lease is no longer owned.');
    mutate(state, current);
    current.updatedAt = new Date().toISOString();
    current.leaseUntil = null;
  });
}
export async function processOne(workspaceId: string) {
  const job = await claim(workspaceId);
  if (!job) return false;
  try {
    if (job.type === 'discovery') {
      const state = await readState(workspaceId);
      const sources = state.sources
        .filter((s) => s.enabled)
        .sort((a, b) => b.priority - a.priority);
      let done = 0;
      let successes = 0;
      for (const source of sources) {
        try {
          const items = await fetchSource(source, async () => {
            await transact(workspaceId, (s) => {
              const j = s.jobs.find((j) => j.id === job.id);
              if (j?.leaseToken !== job.leaseToken || j.status !== 'running')
                throw new Error('Lost discovery lease.');
              j.leaseUntil = new Date(Date.now() + 180000).toISOString();
            });
          });
          await transact(workspaceId, (s) => {
            const sourceNow = s.sources.find((x) => x.id === source.id);
            if (!sourceNow) return;
            for (const item of items) {
              const story = ingest(s, sourceNow, item);
              if (story && ['website', 'sitemap'].includes(sourceNow.sourceType))
                story.extractionConfidence = 'metadata';
            }
            sourceNow.lastCheckedAt = new Date().toISOString();
            sourceNow.lastSuccessAt = sourceNow.lastCheckedAt;
            sourceNow.status = `Retrieved ${items.length} source entries`;
            event(s, `${sourceNow.name}: ${items.length} source entries retrieved.`);
          });
          successes++;
        } catch (e) {
          await transact(workspaceId, (s) => {
            const src = s.sources.find((x) => x.id === source.id);
            if (src) {
              const message = e instanceof Error ? e.message : 'Source failed';
              src.status = message;
              src.lastCheckedAt = new Date().toISOString();
              src.failures = [`${src.lastCheckedAt}: ${message}`, ...src.failures].slice(0, 20);
              event(s, `${src.name}: ${message}`, 'worker', 'warning');
            }
          });
        }
        done++;
        await transact(workspaceId, (s) => {
          const j = s.jobs.find((j) => j.id === job.id);
          if (j?.leaseToken === job.leaseToken) {
            j.progress = Math.round((done / sources.length) * 100);
            j.message = `Checked ${done}/${sources.length} sources`;
            j.leaseUntil = new Date(Date.now() + 180000).toISOString();
          }
        });
      }
      await finish(workspaceId, job, (_s, j) => {
        j.status = sources.length && successes === 0 ? 'failed' : 'succeeded';
        j.progress = 100;
        j.message = sources.length
          ? `${successes}/${sources.length} sources retrieved. Review source health for failures.`
          : 'No enabled sources. Add a validated feed or import a story manually.';
      });
    }
    if (job.type === 'generate') {
      const state = await readState(workspaceId);
      const story = state.stories.find((s) => s.id === job.payload.storyId);
      const portal = state.portals.find((p) => p.id === job.payload.portalId);
      if (!story?.facts.locked || story.facts.version !== job.payload.factVersion || !portal)
        throw new Error('The locked facts or portal changed before generation.');
      const spent = state.usage.reduce((n, u) => n + (u.estimatedCostUsd || 0), 0);
      if (spent >= state.workspace.budgetUsd)
        throw new Error('The configured API usage budget has been reached.');
      const result = await generateContent(
        story.facts,
        portal,
        state.workspace.generationPreferences
      );
      await finish(workspaceId, job, (s, j) => {
        const current = s.stories.find((x) => x.id === story.id);
        if (!current?.facts.locked || current.facts.version !== job.payload.factVersion)
          throw new Error('Facts changed while generation was running.');
        const now = new Date().toISOString();
        s.usage.push({
          id: randomUUID(),
          at: now,
          provider: 'openai',
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          estimatedCostUsd: estimatedCost(result.inputTokens, result.outputTokens),
        });
        if (job.payload.editionId) {
          const existing = s.editions.find((e) => e.id === job.payload.editionId);
          if (
            !existing ||
            existing.revision !== job.payload.revision ||
            ['Published', 'Publishing'].includes(existing.status)
          ) {
            j.status = 'failed';
            j.message = 'Edition changed while regenerating; output discarded and usage recorded.';
            return;
          }
          s.revisions.push({
            id: randomUUID(),
            editionId: existing.id,
            version: existing.revision,
            content: existing.content,
            actor: 'openai-worker',
            createdAt: now,
          });
          existing.content = mergeRegeneration(existing.content, result.content, job.payload.part);
          existing.revision++;
          existing.updatedAt = now;
          existing.factVersion = story.facts.version;
          existing.status = 'Awaiting Review';
          existing.approvedAt = null;
          existing.approvedBy = null;
          existing.designAssetId = null;
          existing.flags = [...result.flags, ...validateContent(existing.content, story.facts)];
          existing.aiChecked = true;
        } else if (!s.editions.some((e) => e.storyId === story.id && e.portalId === portal.id))
          s.editions.push({
            id: randomUUID(),
            storyId: story.id,
            portalId: portal.id,
            factVersion: story.facts.version,
            content: result.content,
            status: 'Awaiting Review',
            flags: [...result.flags, ...validateContent(result.content, story.facts)],
            aiChecked: true,
            approvedBy: null,
            approvedAt: null,
            designAssetId: null,
            imageAssetId: null,
            createdAt: now,
            updatedAt: now,
            revision: 1,
            generationMode: 'openai',
            comment: '',
          });
        j.status = 'succeeded';
        j.progress = 100;
        j.message = 'Bilingual generation completed. Human review required.';
        event(s, j.message);
      });
    }
    if (job.type === 'design') {
      const state = await readState(workspaceId);
      const edition = state.editions.find((e) => e.id === job.payload.editionId);
      const template = state.templates.find((t) => t.id === job.payload.templateId);
      if (!edition || !template || edition.revision !== job.payload.revision)
        throw new Error('Edition or template changed.');
      const asset = await renderCard(state, edition, template);
      await finish(workspaceId, job, (s, j) => {
        const e = s.editions.find((e) => e.id === edition.id);
        if (!e || e.revision !== job.payload.revision)
          throw new Error('Edition changed while rendering.');
        s.media.push(asset);
        e.designAssetId = asset.id;
        j.status = 'succeeded';
        j.progress = 100;
        j.message = 'Graphic rendered. Inspect text fitting and approve the asset.';
      });
    }
    if (job.type === 'publish')
      await finish(workspaceId, job, (s, j) => {
        const p = s.publications.find((p) => p.id === job.payload.publicationId);
        const e = s.editions.find((e) => e.id === job.payload.editionId);
        if (!p || !e || !e.approvedAt || e.revision !== job.payload.revision)
          throw new Error('Approval or edition revision changed.');
        p.status = 'Requires Manual Action';
        p.response =
          'Automatic publisher is not validated. Copy caption, upload approved media, publish in the platform, then record its actual URL and ID.';
        e.status = 'Requires Manual Action';
        j.status = 'manual';
        j.progress = 100;
        j.message = p.response;
        event(s, 'Publication is due and requires manual action. No external post was created.');
      });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Worker failed';
    log('error', 'job_failed', { jobId: job.id, type: job.type, message });
    await finish(workspaceId, job, (s, j) => {
      j.message = message;
      if (j.type === 'publish') {
        j.status = 'ambiguous';
        const p = s.publications.find((p) => p.jobId === j.id);
        if (p) {
          p.status = 'Failed';
          p.response = 'Requires reconciliation: ' + message;
        }
      } else {
        j.status = j.attempts >= 3 ? 'dead' : 'queued';
        j.runAt = new Date(Date.now() + retryDelay(j.attempts)).toISOString();
      }
      event(s, `${j.type}: ${message}`, 'worker', 'error');
    }).catch((e) =>
      log('error', 'job_finish_failed', {
        message: e instanceof Error ? e.message : 'Unknown failure',
      })
    );
  }
  return true;
}
