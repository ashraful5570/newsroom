import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { transact, readState, pool } from '../src/lib/store';
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('real PostgreSQL transaction and RLS integration', () => {
  const db = new Pool({ connectionString: url });
  const ownerA = randomUUID(),
    ownerB = randomUUID(),
    workspaceA = randomUUID(),
    workspaceB = randomUUID();
  afterAll(async () => {
    await db.query('DELETE FROM workspaces WHERE id=ANY($1::uuid[])', [[workspaceA, workspaceB]]);
    await db.query('DELETE FROM profiles WHERE id=ANY($1::uuid[])', [[ownerA, ownerB]]);
    await db.end();
    if (process.env.DATABASE_URL === url) await pool().end();
    vi.unstubAllEnvs();
  });
  it('prepares independent workspace identities', async () => {
    await db.query('INSERT INTO profiles(id,email) VALUES($1,$2),($3,$4)', [
      ownerA,
      'test-a@example.invalid',
      ownerB,
      'test-b@example.invalid',
    ]);
    await db.query('INSERT INTO workspaces(id,name,owner_id) VALUES($1,$2,$3),($4,$5,$6)', [
      workspaceA,
      'A',
      ownerA,
      workspaceB,
      'B',
      ownerB,
    ]);
    await db.query(
      "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner'),($3,$4,'owner')",
      [workspaceA, ownerA, workspaceB, ownerB]
    );
    expect(
      (
        await db.query('SELECT id FROM workspaces WHERE id=ANY($1::uuid[])', [
          [workspaceA, workspaceB],
        ])
      ).rowCount
    ).toBe(2);
  });
  it('runs repository persistence and relational projections in a transaction', async () => {
    vi.stubEnv('DATABASE_URL', url!);
    vi.stubEnv('NEWSROOM_MODE', 'production');
    await transact(workspaceA, (s) => {
      s.workspace.name = 'Tenant A';
    });
    await transact(workspaceB, (s) => {
      s.workspace.name = 'Tenant B';
    });
    expect((await readState(workspaceA)).workspace.name).toBe('Tenant A');
    expect(
      (await db.query('SELECT id FROM sources WHERE workspace_id=$1', [workspaceA])).rowCount
    ).toBe(7);
  });
  it('serializes concurrent updates without losing changes', async () => {
    await Promise.all(
      Array.from({ length: 4 }, () =>
        transact(workspaceA, (s) => {
          s.workspace.budgetUsd += 1;
        })
      )
    );
    expect((await readState(workspaceA)).workspace.budgetUsd).toBe(14);
  });
  it('rolls back failed mutations and preserves the original document', async () => {
    await expect(
      transact(workspaceA, (s) => {
        s.workspace.name = 'Unexpected';
        throw new Error('rollback');
      })
    ).rejects.toThrow('rollback');
    expect((await readState(workspaceA)).workspace.name).toBe('Tenant A');
  });
  it('enforces tenant isolation with an actual authenticated RLS role', async () => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE authenticated');
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [ownerA]);
      expect((await client.query('SELECT DISTINCT workspace_id FROM sources')).rows).toEqual([
        { workspace_id: workspaceA },
      ]);
      expect(
        (await client.query('SELECT id FROM workspaces WHERE id=$1', [workspaceB])).rows
      ).toHaveLength(0);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
  it('denies client reads of credential-bearing state and connection tables', async () => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE authenticated');
      await expect(client.query('SELECT data FROM newsroom_state')).rejects.toThrow(
        'permission denied'
      );
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
  it('rejects cross-tenant references at the database boundary', async () => {
    const storyId = randomUUID();
    await expect(
      db.query('INSERT INTO stories(id,workspace_id,data) VALUES($1,$2,$3)', [
        storyId,
        workspaceA,
        JSON.stringify({ sourceId: (await readState(workspaceB)).sources[0].id }),
      ])
    ).rejects.toThrow('foreign key');
  });
});
