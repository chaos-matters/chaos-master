import { defineConfig, devices } from '@playwright/test'

/**
 * Resilience-focused Playwright config (separate from the legacy
 * console-errors config). Drives the dev server over HTTPS (basic-ssl) and
 * exercises the WebGPU graceful-fallback handling.
 *
 *   chromium-gpu      headed, real AMD GPU + WebGPU flags  -> healthy render,
 *                     then force-degrade via __chaosForceGpuUnavailable()
 *   chromium-degraded headless, no WebGPU -> always-degraded shell + posters
 *
 * Run:  pnpm exec playwright test -c playwright.resilience.config.ts
 *       pnpm exec playwright test -c playwright.resilience.config.ts --project chromium-degraded
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /webgpu-resilience\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 90_000,
  use: {
    baseURL: 'https://localhost:5173',
    ignoreHTTPSErrors: true,
    trace: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium-gpu',
      use: {
        ...devices['Desktop Chrome'],
        headless: false,
        launchOptions: {
          args: [
            '--enable-unsafe-webgpu',
            '--enable-features=Vulkan',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
    {
      name: 'chromium-degraded',
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
      },
    },
  ],
})
