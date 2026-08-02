import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for Lumen Apeiron app.
 *
 * These tests capture console errors during rendering and help prevent
 * runtime errors like "Cannot read properties of undefined (reading 'x')"
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,

  forbidOnly: !!process.env.CI,

  retries: process.env.CI ? 2 : 0,

  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'https://localhost:3000',
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Only run these tests in CI or manually
  // They require a running dev server
  testMatch: /.*\.spec\.ts/,
  // GPU-only suites (`*.gpu.spec.ts`) need a real GPU — they run via the headed
  // playwright.resilience.config.ts on a local machine, never on CI.
  testIgnore: /\.gpu\.spec\.ts$/,
})
