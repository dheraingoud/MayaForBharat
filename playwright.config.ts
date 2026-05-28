import { defineConfig, devices } from '@playwright/test'

const port = process.env.PORT || '3000'
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${port}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Run one by one to analyze screenshots
  workers: 1,
  use: {
    baseURL,
    trace: 'on',
    screenshot: 'on',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
  reporter: [['html', { open: 'never' }], ['list']],
})
