import { defineConfig, devices } from '@playwright/test'

const isCI = process.env.CI !== undefined

/**
 * The port this run serves the production build on, `E2E_PORT` to override.
 *
 * Not 4173, vite preview's default, where a person's own preview server
 * usually sits, and not 5173, vite's dev server. The config pinned 4173 and
 * reused whatever already answered there, so a local run could test someone
 * else's server, built from another checkout, and report on it as if it were
 * this one. Now a run always starts its own server, and if the port is taken
 * Playwright stops with "is already used" instead of reusing it. To iterate
 * against a server you started yourself on your own port, set
 * `E2E_REUSE_SERVER=1` as well. packages/app/TESTING.md has the recipe.
 */
const port = Number(process.env.E2E_PORT ?? 4273)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(
    `E2E_PORT must be a port number, not '${process.env.E2E_PORT}'`,
  )
}
const origin = `https://localhost:${port}`
const reuseExistingServer = !isCI && process.env.E2E_REUSE_SERVER === '1'

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
  // The preview server (vite preview + basic-ssl, --strictPort) owns the port,
  // so tests don't depend on a separately-started dev server.
  webServer: {
    command: `pnpm --filter chaos-master e2e:serve --port ${port}`,
    url: origin,
    reuseExistingServer,
    timeout: 180_000,
    ignoreHTTPSErrors: true,
  },
  use: {
    baseURL: origin,
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
