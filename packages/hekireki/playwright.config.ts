import { defineConfig, devices } from '@playwright/test'

import { BASE_URL } from './e2e/workspace.js'

// The tests drive the built Studio (`pnpm build` first) through e2e/serve.ts: the CLI serves
// dist/web and edits a throwaway workspace, so a run never touches the fixtures or a real project.

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.test.ts',
  // The editor autosaves to disk and the grid writes to the database: the tests share one
  // server and one workspace, so they run one at a time.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  outputDir: './e2e/.results',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    viewport: { width: 1400, height: 900 },
    colorScheme: 'light',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node e2e/serve.ts',
    url: `${BASE_URL}/api/schema`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
