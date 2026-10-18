import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
async function main() {
  const { sandbox, log } = await import('../src/lib/config');
  const { pool, SANDBOX_WORKSPACE } = await import('../src/lib/store');
  const { processOne } = await import('../src/lib/worker');
  let running = true;
  process.on('SIGTERM', () => {
    running = false;
  });
  process.on('SIGINT', () => {
    running = false;
  });
  log('info', 'worker_started', { mode: sandbox() ? 'sandbox' : 'postgres' });
  while (running) {
    try {
      const workspaces = sandbox()
        ? [SANDBOX_WORKSPACE]
        : (await pool().query('SELECT id FROM workspaces')).rows.map((r: { id: string }) => r.id);
      for (const id of workspaces) await processOne(id);
    } catch (e) {
      log('error', 'worker_loop', { message: e instanceof Error ? e.message : 'Unknown error' });
    }
    await new Promise((resolve) => setTimeout(resolve, Number(process.env.WORKER_POLL_MS) || 2000));
  }
  if (!sandbox()) await pool().end();
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
