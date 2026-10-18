import { test, expect, type APIRequestContext } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
let worker: ChildProcess;
test.beforeAll(() => {
  worker = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/worker.ts'], {
    env: {
      ...process.env,
      NEWSROOM_MODE: 'sandbox',
      DATA_DIR: process.env.NEWSROOM_E2E_DATA_DIR,
      WORKER_POLL_MS: '200',
    },
    stdio: 'ignore',
  });
});
test.afterAll(() => worker?.kill('SIGTERM'));
async function command(
  request: APIRequestContext,
  action: string,
  input: Record<string, unknown> = {}
) {
  const r = await request.post('/api/command', {
    headers: { Origin: 'http://localhost:3100' },
    data: { action, input },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
test('first-run setup, empty dashboard, and mobile layout', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Create your workspace', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'A clearer view of your newsroom.' })
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your next story starts here.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.bottom-nav')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true });
});
test('source management works without inventing Facebook URLs or templates', async ({ page }) => {
  await page.goto('/?view=sources');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('Awaiting URL Confirmation', { exact: true })).toHaveCount(3);
  await page.getByRole('button', { name: 'Add source', exact: true }).click();
  await page.getByLabel('Publisher name').fill('Authorized test feed');
  await page
    .getByLabel('Website, feed, or confirmed Facebook page URL')
    .fill('https://example.com/test.xml');
  await page.getByRole('button', { name: 'Save source', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText('Authorized test feed', { exact: true })).toBeVisible();
  await page.locator('.nav-item').filter({ hasText: 'Templates' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your brand. Your first template.' })
  ).toBeVisible();
});
test('real manual editorial flow: import, fact lock, bilingual revision, PNG, approval and manual publication', async ({
  page,
  request,
}) => {
  const { state } = await (await request.get('/api/state')).json();
  await command(request, 'workspace.save', { ...state.workspace, onboarded: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'Import story', exact: true }).click();
  await page
    .getByLabel('Original story / post URL')
    .fill('https://example.com/authorized-test-story');
  await page.getByLabel('Original headline').fill('Campus library opens a reading room');
  await page
    .getByLabel('Original source text')
    .fill('The campus library opened a reading room, according to a library statement.');
  await page.getByRole('button', { name: 'Import for evidence review' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const imported = (await (await request.get('/api/state')).json()).state;
  const story = imported.stories[0];
  const facts = {
    ...story.facts,
    claims: [
      {
        id: crypto.randomUUID(),
        text: 'The campus library opened a reading room, according to a library statement.',
        type: 'fact',
        status: 'Unverified',
        conflict: '',
        evidence: [
          {
            url: story.url,
            publisher: story.publisher,
            origin: story.publisher,
            excerpt: story.body,
            retrievedAt: null,
          },
        ],
      },
    ],
  };
  await command(request, 'facts.save', { id: story.id, facts, expectedVersion: 1 });
  await command(request, 'facts.lock', { id: story.id });
  await command(request, 'edition.generate', {
    storyId: story.id,
    portalIds: imported.portals.slice(0, 2).map((p: { id: string }) => p.id),
    mode: 'manual',
  });
  await page.goto('/?view=studio');
  await expect(page.getByLabel('Primary headline')).toHaveValue(story.title);
  await page.getByLabel('শিরোনাম 1').fill('ক্যাম্পাস লাইব্রেরিতে পাঠকক্ষ চালু');
  await page.getByLabel('শিরোনাম 2').fill('নতুন পাঠকক্ষ খুলেছে লাইব্রেরি');
  await page
    .getByLabel('বাংলা প্রতিবেদন', { exact: true })
    .fill('লাইব্রেরির বিবৃতি অনুযায়ী ক্যাম্পাস লাইব্রেরি একটি পাঠকক্ষ চালু করেছে।');
  await page
    .getByLabel('Caption', { exact: true })
    .fill('The library says its reading room is open.');
  await page.getByRole('button', { name: 'Save draft & check consistency' }).click();
  await expect(page.getByLabel('Primary headline')).toBeVisible();
  const latest = (await (await request.get('/api/state')).json()).state;
  const edition = latest.editions[0];
  const templateId = crypto.randomUUID();
  await command(request, 'template.save', {
    id: templateId,
    name: 'Editorial square',
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
  await page.reload();
  await page.getByLabel('Graphic template').selectOption(templateId);
  await page.getByRole('button', { name: 'Generate graphic', exact: true }).click();
  await expect(
    page.getByAltText('Generated editorial graphic requiring visual review')
  ).toBeVisible({ timeout: 20000 });
  await page.getByLabel('I inspected typography, overflow, and rights.').check();
  await page
    .getByLabel(
      'I reviewed both languages, names, dates, numbers, quotations, attribution, and uncertainty against the locked facts.'
    )
    .check();
  await page.getByRole('button', { name: 'Approve edition', exact: true }).click();
  await page
    .getByLabel('Destination', { exact: true })
    .selectOption(latest.connections.find((c: { provider: string }) => c.provider === 'meta').id);
  await page.getByRole('button', { name: 'Prepare manual publishing' }).click();
  await expect(page.getByText('Record manual publication', { exact: true })).toBeVisible();
  const pending = (await (await request.get('/api/state')).json()).state.publications[0];
  expect(pending.externalId).toBeNull();
  await page
    .getByLabel('Actual post URL')
    .fill('https://www.facebook.com/example/posts/editorial-test');
  await page.getByLabel('Actual platform post ID').fill('editorial-test');
  await page.getByRole('button', { name: 'Record manual publication' }).click();
  await expect(page.getByRole('link', { name: 'View recorded post' })).toBeVisible();
  const recorded = (await (await request.get('/api/state')).json()).state;
  expect(recorded.publications[0].response).toContain('not API-verified');
  expect(recorded.editions.find((e: { id: string }) => e.id === edition.id).status).toBe(
    'Published'
  );
  expect(recorded.editions).toHaveLength(2);
});
test('integration failures remain honest and CSRF is blocked', async ({ request }) => {
  const denied = await request.post('/api/command', {
    headers: { Origin: 'https://attacker.invalid' },
    data: { action: 'discovery.start' },
  });
  expect(denied.status()).toBe(403);
  const testResult = await request.post('/api/command', {
    headers: { Origin: 'http://localhost:3100' },
    data: { action: 'connection.test', input: { provider: 'canva' } },
  });
  expect(testResult.status()).toBe(422);
  const { state } = await (await request.get('/api/state')).json();
  expect(state.connections.find((c: { provider: string }) => c.provider === 'canva').status).toBe(
    'Error'
  );
  expect(JSON.stringify(state)).not.toContain('access_token');
});
