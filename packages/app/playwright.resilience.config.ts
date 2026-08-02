import { defineConfig, devices } from '@playwright/test'

/**
 * Headed-GPU e2e config (separate from the legacy console-errors config). Drives
 * the HTTPS dev server (basic-ssl) and exercises WebGPU-dependent behaviour:
 * graceful fallback (webgpu-resilience) and gallery preview perf
 * (variation-gallery). Add future GPU/feature specs to e2e/ and list them in
 * testMatch below.
 *
 *   chromium-gpu      headed, real AMD GPU + WebGPU flags  -> healthy render,
 *                     force-degrade via __chaosForceGpuUnavailable(), bounded
 *                     gallery previews
 *   chromium-degraded headless, no WebGPU -> always-degraded shell + posters
 *                     (GPU-only specs self-skip here)
 *
 * Start the HTTPS dev server on :5173 first (cd packages/app && pnpm start), then:
 *   pnpm exec playwright test -c playwright.resilience.config.ts
 *   pnpm exec playwright test -c playwright.resilience.config.ts --project chromium-gpu variation-gallery
 * If Vite selects a later free port, pass its printed origin through
 * PLAYWRIGHT_BASE_URL.
 */
export default defineConfig({
  testDir: './e2e',
  // The resilience suite plus every GPU-only suite (`*.gpu.spec.ts`).
  testMatch: /(webgpu-resilience\.spec|\.gpu\.spec)\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 90_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'https://localhost:5173',
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
