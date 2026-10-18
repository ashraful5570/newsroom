import { loadEnvConfig } from '@next/env';
import { readdir, readFile } from 'node:fs/promises';
import { Pool } from 'pg';
loadEnvConfig(process.cwd());
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL.');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  });
  const db = await pool.connect();
  try {
    await db.query('SELECT pg_advisory_lock(72819014)');
    await db.query(
      'CREATE TABLE IF NOT EXISTS newsroom_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'
    );
    for (const file of (await readdir('supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      if ((await db.query('SELECT name FROM newsroom_migrations WHERE name=$1', [file])).rowCount)
        continue;
      await db.query('BEGIN');
      try {
        await db.query(await readFile(`supabase/migrations/${file}`, 'utf8'));
        await db.query('INSERT INTO newsroom_migrations(name) VALUES($1)', [file]);
        await db.query('COMMIT');
        console.log(`Applied ${file}`);
      } catch (e) {
        await db.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    await db.query('SELECT pg_advisory_unlock(72819014)');
    db.release();
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
