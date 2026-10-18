import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { sandbox, required } from './config';
import { pool, SANDBOX_WORKSPACE } from './store';
export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll(items) {
          for (const { name, value, options } of items) jar.set(name, value, options);
        },
      },
    }
  );
}
export type Context = {
  workspaceId: string;
  actor: string;
  role: 'owner' | 'editor' | 'viewer';
  sandbox: boolean;
};
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
export async function context(): Promise<Context> {
  if (sandbox())
    return {
      workspaceId: SANDBOX_WORKSPACE,
      actor: 'sandbox-editor',
      role: 'owner',
      sandbox: true,
    };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.DATABASE_URL)
    throw new HttpError(
      503,
      'Configure Supabase and DATABASE_URL, or explicitly enable the local sandbox.'
    );
  const client = await supabaseServer();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'Sign in to your newsroom.');
  let member = await pool().query(
    'SELECT workspace_id,role FROM workspace_members WHERE user_id=$1 ORDER BY created_at LIMIT 1',
    [data.user.id]
  );
  if (!member.rows.length) {
    const db = await pool().connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [data.user.id]);
      member = await db.query(
        'SELECT workspace_id,role FROM workspace_members WHERE user_id=$1 LIMIT 1',
        [data.user.id]
      );
      if (!member.rows.length) {
        const wid = randomUUID();
        await db.query('INSERT INTO profiles(id,email) VALUES($1,$2) ON CONFLICT(id) DO NOTHING', [
          data.user.id,
          data.user.email,
        ]);
        await db.query('INSERT INTO workspaces(id,name,owner_id) VALUES($1,$2,$3)', [
          wid,
          'My newsroom',
          data.user.id,
        ]);
        await db.query(
          "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner')",
          [wid, data.user.id]
        );
        member = { ...member, rows: [{ workspace_id: wid, role: 'owner' }] };
      }
      await db.query('COMMIT');
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    } finally {
      db.release();
    }
  }
  return {
    workspaceId: member.rows[0].workspace_id,
    actor: data.user.id,
    role: member.rows[0].role,
    sandbox: false,
  };
}
export function assertWrite(ctx: Context) {
  if (ctx.role === 'viewer') throw new HttpError(403, 'This action requires an editor role.');
}
export function assertOwner(ctx: Context) {
  if (ctx.role !== 'owner')
    throw new HttpError(403, 'This action requires workspace owner permissions.');
}
export function checkOrigin(request: Request) {
  const expected = new URL(process.env.APP_URL || 'http://localhost:3000').origin;
  const origin = request.headers.get('origin');
  if (!origin || origin !== expected)
    throw new HttpError(403, 'Request origin does not match APP_URL.');
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json')
    throw new HttpError(415, 'Use application/json.');
}
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset < now) {
    buckets.set(key, { count: 1, reset: now + 60000 });
    return;
  }
  if (++bucket.count > 120) throw new HttpError(429, 'Too many requests. Retry in one minute.');
  if (buckets.size > 10000) for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}
