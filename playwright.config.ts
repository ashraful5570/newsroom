import { defineConfig, devices } from '@playwright/test';
process.env.NEWSROOM_E2E_DATA_DIR ||= `/tmp/newsroom-e2e-${process.pid}`;
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      args: ['--no-sandbox'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      process.env.E2E_PRODUCTION === '1' ? 'PORT=3100 npm start' : 'npm run dev -- --port 3100',
    url: 'http://localhost:3100/api/health',
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      NEWSROOM_MODE: 'sandbox',
      APP_URL: 'http://localhost:3100',
      DATA_DIR: process.env.NEWSROOM_E2E_DATA_DIR,
    },
  },
});
