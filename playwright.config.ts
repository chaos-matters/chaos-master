import { defineConfig, devices } from '@playwright/test'

const isCI = process.env.CI !== undefined

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: 'html',
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
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            // Enable the WebGPU API in headless chromium; swiftshader provides
            // the software adapter so tests render the real app (no GPU needed).
            '--enable-unsafe-webgpu',
            '--enable-unsafe-swiftshader',
            '--use-gl=angle',
            '--use-angle=swiftshader-webgl',
          ],
        },
      },
    },
  ],
})
