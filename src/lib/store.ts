import { mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { stateSchema, type State } from './schema';
import { seed } from './seed';
import { sandbox } from './config';
const globalDb = globalThis as unknown as { newsroomPool?: Pool };
export function pool() {
  return (globalDb.newsroomPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  }));
}
const directory = () => process.env.DATA_DIR || path.join(process.cwd(), '.data');
const tables = {
  factRevisions: 'fact_revisions',
  sources: 'sources',
  portals: 'news_portals',
  stories: 'stories',
  editions: 'portal_editions',
  templates: 'design_templates',
  media: 'media_assets',
  jobs: 'publication_jobs',
  publications: 'published_posts',
  connections: 'social_connections',
  revisions: 'article_revisions',
  events: 'job_events',
  usage: 'api_usage',
  suggestions: 'source_suggestions',
  sourceItems: 'source_items',
  retrievedEvidence: 'story_evidence',
} as const;
async function persist(client: PoolClient, state: State) {
  await client.query('UPDATE newsroom_state SET data=$2, updated_at=now() WHERE workspace_id=$1', [
    state.workspace.id,
    JSON.stringify(state),
  ]);
  const derived: Record<string, { id: string; [key: string]: unknown }[]> = {
    fact_ledgers: state.stories.map((s) => ({ id: s.id, ...s.facts })),
    story_clusters: state.stories.map((s) => ({
      id: s.clusterId,
      storyId: s.id,
      urls: [s.url, ...s.relatedUrls],
    })),
    editorial_queue: state.stories
      .filter((s) => s.selected)
      .map((s) => ({ id: s.id, storyId: s.id })),
    generated_articles: state.editions.map((e) => ({ id: e.id, ...e.content })),
    source_fetch_jobs: state.jobs.filter((j) => j.type === 'discovery'),
    design_jobs: state.jobs.filter((j) => j.type === 'design'),
    scheduled_posts: state.publications.filter((p) => p.scheduledAt),
    audit_logs: state.events,
  };
  for (const [table, records] of Object.entries(derived)) {
    await client.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [state.workspace.id]);
    for (const r of records)
      await client.query(`INSERT INTO ${table}(id,workspace_id,data) VALUES($1,$2,$3)`, [
        r.id,
        state.workspace.id,
        JSON.stringify(r),
      ]);
  }
  for (const [collection, table] of Object.entries(tables)) {
    const records = state[collection as keyof typeof tables];
    const ids = records.map((r) => r.id);
    await client.query(`DELETE FROM ${table} WHERE workspace_id=$1 AND NOT (id=ANY($2::uuid[]))`, [
      state.workspace.id,
      ids,
    ]);
    for (const record of records) {
      await client.query(
        `INSERT INTO ${table}(id,workspace_id,data) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=now() WHERE ${table}.workspace_id=excluded.workspace_id`,
        [record.id, state.workspace.id, JSON.stringify(record)]
      );
    }
  }
}
export async function transact<T>(
  workspaceId: string,
  mutate: (state: State) => T | Promise<T>
): Promise<T> {
  if (!sandbox()) {
    if (!process.env.DATABASE_URL)
      throw new Error(
        'DATABASE_URL is required. Use NEWSROOM_MODE=sandbox only for local development.'
      );
    const client = await pool().connect();
    try {
      await client.query('BEGIN');
      let result = await client.query(
        'SELECT data FROM newsroom_state WHERE workspace_id=$1 FOR UPDATE',
        [workspaceId]
      );
      if (!result.rows.length) {
        const initial = seed();
        initial.workspace.id = workspaceId;
        await client.query(
          'INSERT INTO newsroom_state(workspace_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [workspaceId, JSON.stringify(initial)]
        );
        result = await client.query(
          'SELECT data FROM newsroom_state WHERE workspace_id=$1 FOR UPDATE',
          [workspaceId]
        );
      }
      const state = stateSchema.parse(result.rows[0].data);
      const out = await mutate(state);
      stateSchema.parse(state);
      await persist(client, state);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  await mkdir(directory(), { recursive: true, mode: 0o700 });
  const lock = path.join(directory(), 'state.lock');
  let acquired = false;
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      await mkdir(lock);
      acquired = true;
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      const s = await stat(lock).catch(() => null);
      if (s && Date.now() - s.mtimeMs > 120000)
        throw new Error('Sandbox storage lock is stale. Stop workers and remove .data/state.lock.');
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  if (!acquired) throw new Error('Storage busy. Retry shortly.');
  try {
    let state: State;
    const file = path.join(directory(), 'state.json');
    try {
      state = stateSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      state = seed();
    }
    const result = await mutate(state);
    stateSchema.parse(state);
    const temp = path.join(directory(), `${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(state), { mode: 0o600 });
    await rename(temp, file);
    return result;
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
export const SANDBOX_WORKSPACE = '00000000-0000-4000-8000-000000000001';
export async function readState(workspaceId: string) {
  return transact(workspaceId, (state) => structuredClone(state));
}
export function event(
  state: State,
  message: string,
  actor = 'system',
  level: 'info' | 'warning' | 'error' = 'info'
) {
  state.events.unshift({ id: randomUUID(), at: new Date().toISOString(), message, actor, level });
  state.events = state.events.slice(0, 500);
}
export function publicState(state: State) {
  return {
    ...state,
    connections: state.connections.map((c) => ({ ...c, tokenEncrypted: null })),
    jobs: state.jobs.map((j) => ({ ...j, payload: { ...j.payload } })),
  };
}
