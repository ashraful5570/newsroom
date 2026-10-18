import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { command } from '../src/lib/commands';
import { transact, readState, SANDBOX_WORKSPACE } from '../src/lib/store';
import { processOne } from '../src/lib/worker';
import { fixture } from './fixtures';
const ctx = {
  workspaceId: SANDBOX_WORKSPACE,
  actor: 'test-editor',
  role: 'owner' as const,
  sandbox: true,
};
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'newsroom-test-'));
  vi.stubEnv('NEWSROOM_MODE', 'sandbox');
  vi.stubEnv('DATA_DIR', directory);
  await transact(ctx.workspaceId, (s) => Object.assign(s, fixture().state));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
async function current() {
  return readState(ctx.workspaceId);
}
describe('persistent editorial workflow (real local store, no external APIs)', () => {
  it('rejects mutation by viewers', async () =>
    await expect(command({ ...ctx, role: 'viewer' }, 'discovery.start', {})).rejects.toThrow(
      'editor'
    ));
  it('requires an owner to change integrations', async () =>
    await expect(
      command({ ...ctx, role: 'editor' }, 'connection.test', { provider: 'openai' })
    ).rejects.toThrow('owner'));
  it('creates multiple portal editions with a shared fact version', async () => {
    const s = await current();
    s.editions = [];
    await transact(ctx.workspaceId, (x) => {
      x.editions = [];
    });
    await command(ctx, 'edition.generate', {
      storyId: s.stories[0].id,
      portalIds: s.portals.slice(0, 2).map((p) => p.id),
      mode: 'manual',
    });
    const result = await current();
    expect(result.editions).toHaveLength(2);
    expect(result.editions.every((e) => e.factVersion === result.stories[0].facts.version)).toBe(
      true
    );
  });
  it('rejects untested OpenAI generation', async () => {
    const s = await current();
    await expect(
      command(ctx, 'edition.generate', {
        storyId: s.stories[0].id,
        portalIds: [s.portals[1].id],
        mode: 'openai',
      })
    ).rejects.toThrow('Test the OpenAI');
  });
  it('requires explicit human confirmation for approval', async () => {
    const e = (await current()).editions[0];
    await expect(command(ctx, 'edition.approve', { id: e.id })).rejects.toThrow('Confirm');
    await command(ctx, 'edition.approve', { id: e.id, reviewConfirmed: true });
    expect((await current()).editions[0].status).toBe('Approved');
  });
  it('prevents publishing before approval', async () => {
    const s = await current();
    await expect(
      command(ctx, 'publication.schedule', {
        id: s.editions[0].id,
        destinationId: s.connections.find((c) => c.provider === 'meta')!.id,
      })
    ).rejects.toThrow('approved');
  });
  it('persists revision history and invalidates approval on edits', async () => {
    const e = (await current()).editions[0];
    await command(ctx, 'edition.approve', { id: e.id, reviewConfirmed: true });
    await command(ctx, 'edition.save', {
      id: e.id,
      expectedRevision: 1,
      content: e.content,
      comment: 'Source link',
    });
    const s = await current();
    expect(s.revisions).toHaveLength(1);
    expect(s.editions[0].approvedAt).toBeNull();
    expect(s.editions[0].revision).toBe(2);
  });
  it('rejects stale concurrent editorial changes', async () => {
    const e = (await current()).editions[0];
    await command(ctx, 'edition.save', { id: e.id, expectedRevision: 1, content: e.content });
    await expect(
      command(ctx, 'edition.save', { id: e.id, expectedRevision: 1, content: e.content })
    ).rejects.toThrow('another session');
  });
  it('rejects forged evidence retrieval timestamps', async () => {
    const s = (await current()).stories[0];
    s.facts.claims[0].evidence[0].retrievedAt = new Date().toISOString();
    await expect(
      command(ctx, 'facts.save', { id: s.id, expectedVersion: 1, facts: s.facts })
    ).rejects.toThrow('server-recorded');
  });
  it('queues a publication once and never claims automatic success', async () => {
    const s = await current(),
      e = s.editions[0],
      destination = s.connections.find((c) => c.provider === 'meta')!;
    await command(ctx, 'edition.approve', { id: e.id, reviewConfirmed: true });
    await command(ctx, 'publication.schedule', { id: e.id, destinationId: destination.id });
    await expect(
      command(ctx, 'publication.schedule', { id: e.id, destinationId: destination.id })
    ).rejects.toThrow();
    await processOne(ctx.workspaceId);
    const done = await current();
    expect(done.publications).toHaveLength(1);
    expect(done.publications[0].status).toBe('Requires Manual Action');
    expect(done.publications[0].externalId).toBeNull();
    expect(done.jobs[0].status).toBe('manual');
  });
  it('records manual URLs as editor reports rather than API verification', async () => {
    const s = await current(),
      e = s.editions[0];
    await command(ctx, 'edition.approve', { id: e.id, reviewConfirmed: true });
    await command(ctx, 'publication.schedule', {
      id: e.id,
      destinationId: s.connections.find((c) => c.provider === 'meta')!.id,
    });
    const p = (await current()).publications[0];
    await command(ctx, 'publication.record', {
      id: p.id,
      url: 'https://www.facebook.com/example/posts/123',
      externalId: '123',
    });
    const recorded = (await current()).publications[0];
    expect(recorded.status).toBe('Published');
    expect(recorded.response).toContain('not API-verified');
  });
  it('rejects arbitrary manual publication destinations', async () => {
    const s = await current(),
      e = s.editions[0];
    await command(ctx, 'edition.approve', { id: e.id, reviewConfirmed: true });
    await command(ctx, 'publication.schedule', {
      id: e.id,
      destinationId: s.connections.find((c) => c.provider === 'meta')!.id,
    });
    const p = (await current()).publications[0];
    await expect(
      command(ctx, 'publication.record', { id: p.id, url: 'javascript:alert(1)', externalId: 'x' })
    ).rejects.toThrow('HTTPS');
  });
  it('does not run a scheduled job before its UTC due time', async () => {
    const s = await current(),
      e = s.editions[0];
    await command(ctx, 'edition.approve', { id: e.id, reviewConfirmed: true });
    await command(ctx, 'publication.schedule', {
      id: e.id,
      destinationId: s.connections.find((c) => c.provider === 'meta')!.id,
      localTime: '2099-01-01T12:00',
    });
    expect(await processOne(ctx.workspaceId)).toBe(false);
    expect((await current()).publications[0].scheduledAt).toBe('2099-01-01T06:00:00.000Z');
  });
  it('cancels scheduled work after a fact revision', async () => {
    const s = await current(),
      e = s.editions[0];
    await command(ctx, 'edition.approve', { id: e.id, reviewConfirmed: true });
    await command(ctx, 'publication.schedule', {
      id: e.id,
      destinationId: s.connections.find((c) => c.provider === 'meta')!.id,
      localTime: '2099-01-01T12:00',
    });
    await command(ctx, 'facts.save', {
      id: s.stories[0].id,
      facts: s.stories[0].facts,
      expectedVersion: 1,
    });
    expect((await current()).jobs[0].status).toBe('cancelled');
  });
  it('marks an abandoned publication lease ambiguous without retry', async () => {
    const s = await current(),
      e = s.editions[0];
    await command(ctx, 'edition.approve', { id: e.id, reviewConfirmed: true });
    await command(ctx, 'publication.schedule', {
      id: e.id,
      destinationId: s.connections.find((c) => c.provider === 'meta')!.id,
    });
    await transact(ctx.workspaceId, (x) => {
      x.jobs[0].status = 'running';
      x.jobs[0].leaseUntil = '2020-01-01T00:00:00Z';
    });
    expect(await processOne(ctx.workspaceId)).toBe(false);
    expect((await current()).jobs[0].status).toBe('ambiguous');
  });
  it('preserves attribution when removing sources', async () => {
    const s = await current();
    await expect(command(ctx, 'source.delete', { id: s.sources[0].id })).rejects.toThrow(
      'attributed'
    );
  });
  it('renders a real PNG using a built-in template', async () => {
    const s = await current();
    const templateId = crypto.randomUUID();
    await command(ctx, 'template.save', {
      id: templateId,
      name: 'Test square',
      kind: 'fallback',
      reference: '',
      width: 1080,
      height: 1080,
      portalIds: [],
      fields: {},
      maxLines: 5,
      minFont: 32,
      margin: 64,
      status: '',
      eligible: false,
    });
    await command(ctx, 'design.generate', { id: s.editions[0].id, templateId });
    await processOne(ctx.workspaceId);
    const rendered = await current();
    expect(rendered.media).toHaveLength(1);
    expect(rendered.media[0].mime).toBe('image/png');
    expect(rendered.media[0].approved).toBe(false);
    expect(rendered.editions[0].designAssetId).toBe(rendered.media[0].id);
  });
  it('isolates source failures and records a failed discovery rather than fake results', async () => {
    await command(ctx, 'discovery.start', {});
    await processOne(ctx.workspaceId);
    const s = await current();
    expect(s.jobs[0].message).toContain('No enabled sources');
    expect(s.stories).toHaveLength(1);
  });
  it('does not silently activate source suggestions', async () => {
    const before = await current();
    expect(before.suggestions[0].decision).toBe('pending');
    await command(ctx, 'suggestion.decide', { id: before.suggestions[0].id, decision: 'added' });
    const s = await current();
    expect(s.sources.at(-1)?.enabled).toBe(false);
  });
  it('rolls back failed local mutations atomically', async () => {
    const before = await current();
    await expect(
      transact(ctx.workspaceId, (s) => {
        s.workspace.name = 'Bad mutation';
        throw new Error('rollback');
      })
    ).rejects.toThrow();
    expect((await current()).workspace.name).toBe(before.workspace.name);
  });
});

describe('multi-destination publication and saved review history', () => {
  it('creates one idempotent job per selected destination', async () => {
    const s = await current(),
      e = s.editions[0];
    await command(ctx, 'edition.approve', { id: e.id, reviewConfirmed: true });
    await command(ctx, 'publication.schedule', {
      id: e.id,
      destinationIds: s.connections
        .filter((c) => c.provider === 'meta' || c.provider === 'buffer')
        .map((c) => c.id),
    });
    const result = await current();
    expect(result.publications).toHaveLength(2);
    expect(new Set(result.jobs.map((j) => j.idempotencyKey)).size).toBe(2);
  });
  it('reports partial manual publication honestly across destinations', async () => {
    const s = await current(),
      e = s.editions[0];
    await command(ctx, 'edition.approve', { id: e.id, reviewConfirmed: true });
    await command(ctx, 'publication.schedule', {
      id: e.id,
      destinationIds: s.connections
        .filter((c) => c.provider === 'meta' || c.provider === 'buffer')
        .map((c) => c.id),
    });
    const posts = (await current()).publications;
    await command(ctx, 'publication.record', {
      id: posts[0].id,
      url: 'https://www.facebook.com/example/posts/1',
      externalId: '1',
    });
    expect((await current()).editions[0].status).toBe('Partially Published');
    await command(ctx, 'publication.record', {
      id: posts[1].id,
      url: 'https://www.facebook.com/example/posts/2',
      externalId: '2',
    });
    expect((await current()).editions[0].status).toBe('Published');
  });
  it('retains old facts and editor identity for comparison', async () => {
    const s = await current(),
      story = s.stories[0];
    await command(ctx, 'facts.save', {
      id: story.id,
      facts: { ...story.facts, notes: 'Revised attribution' },
      expectedVersion: 1,
    });
    const result = await current();
    expect(result.factRevisions).toHaveLength(1);
    expect(result.factRevisions[0].actor).toBe(ctx.actor);
    expect(result.factRevisions[0].facts.notes).toBe('');
    expect(result.stories[0].facts.notes).toBe('Revised attribution');
  });
  it('requires a permission reference for public extraction', async () => {
    const source = (await current()).sources[0];
    await expect(
      command(ctx, 'source.save', {
        ...source,
        ingestionPolicy: 'public-extraction',
        reliability: '',
      })
    ).rejects.toThrow('permission');
  });
  it('saves a disconnected manual destination without pretending authorization', async () => {
    await command(ctx, 'connection.destination.save', {
      name: 'My real Page reference',
      provider: 'meta',
      accountId: 'https://www.facebook.com/my-confirmed-page',
    });
    const c = (await current()).connections.at(-1)!;
    expect(c.status).toBe('Disconnected');
    expect(c.tokenEncrypted).toBeNull();
  });
  it('synchronizes template assignments edited from portal settings', async () => {
    const s = await current(),
      tid = crypto.randomUUID();
    await command(ctx, 'template.save', {
      id: tid,
      name: 'Portal layout',
      kind: 'fallback',
      reference: '',
      width: 1080,
      height: 1080,
      portalIds: [],
      fields: {},
      maxLines: 5,
      minFont: 32,
      margin: 64,
      status: '',
      eligible: false,
    });
    await command(ctx, 'portal.save', { ...s.portals[0], templateIds: [tid] });
    expect((await current()).templates[0].portalIds).toContain(s.portals[0].id);
  });
});
