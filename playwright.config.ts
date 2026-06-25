import { defineConfig, devices } from '@playwright/test'

const isCI = process.env.CI !== undefined

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'https://localhost:3000',
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
