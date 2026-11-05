import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  outputDir: process.env.LUMEN_TEST_OUTPUT || './test-results',
  fullyParallel: true,
  use: {
    baseURL: process.env.LUMEN_TEST_URL || 'http://127.0.0.1:55106',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    {
      name: 'iphone',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
    { name: 'android', use: { ...devices['Pixel 7'] } },
    {
      name: 'tablet',
      use: { ...devices['iPad Pro 11'], defaultBrowserType: 'chromium' },
    },
  ],
  webServer: process.env.LUMEN_TEST_URL
    ? undefined
    : {
        command:
          'npm run preview -- --host 127.0.0.1 --port 55106 --strictPort',
        url: 'http://127.0.0.1:55106',
        reuseExistingServer: false,
      },
});
