import { defineConfig, devices } from '@playwright/test'

const isCI = process.env.CI !== undefined

/** Specs that pass on the software adapter GitHub runners provide. */
const CI_SPEC = /\.ci\.spec\.ts$/

const swiftshader = {
  ...devices['Desktop Chrome'],
  launchOptions: {
    args: [
      // Enable the WebGPU API in headless chromium; swiftshader provides the
      // software adapter so tests render the real app (no GPU needed).
      '--enable-unsafe-webgpu',
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader-webgl',
    ],
  },
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: [['html'], ['./tests/reporters/failOnUnexpectedSkip.ts']],
  // Build the app and serve the production preview, then run e2e against it.
  // The preview server (vite preview + basic-ssl) owns the port, so tests don't
  // depend on a separately-started dev server.
  webServer: {
    command: 'pnpm --filter chaos-master e2e:serve',
    url: 'https://localhost:4173',
    reuseExistingServer: !isCI,
    timeout: 180_000,
    ignoreHTTPSErrors: true,
  },
  use: {
    baseURL: 'https://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      // Specs that do not hold on the software adapter. `pnpm test:e2e` runs
      // them with the same swiftshader flags as CI, so nothing enforces them;
      // checking them needs a real GPU (packages/app/TESTING.md).
      name: 'chromium',
      testIgnore: CI_SPEC,
      use: swiftshader,
    },
    {
      // What CI runs: specs that hold on a software adapter. A skip here fails
      // the run (tests/reporters/failOnUnexpectedSkip.ts).
      name: 'chromium-ci',
      testMatch: CI_SPEC,
      use: swiftshader,
    },
  ],
})
