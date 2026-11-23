import { expect, test } from '@playwright/test';

test('native populated Scheduled Jobs visual reference', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const login = await page.request.post('/api/v1/auth/local', {
    data: { email: 'admin@seerr.dev', password: 'test1234' },
  });
  expect(login.status()).toBe(200);
  const theme = await page.request.post(
    '/api/v1/user/1/settings/interface-theme',
    { data: { theme: 'seerrOrig' } }
  );
  expect(theme.status()).toBe(200);

  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/user/1/settings/main', (route) =>
    route.fulfill({ json: { locale: 'en' } })
  );
  await page.route('**/api/v1/settings/jobs', (route) =>
    route.fulfill({
      json: [
        {
          id: 'plex-recently-added-scan',
          name: 'Raw internal job name',
          type: 'process',
          interval: 'minutes',
          cronSchedule: '0 */15 * * * *',
          enabled: true,
          running: false,
          nextExecutionTime: '2026-11-23T16:00:00.000Z',
        },
      ],
    })
  );
  await page.route('**/api/v1/settings/cache', (route) =>
    route.fulfill({
      json: {
        apiCaches: [],
        imageCache: {
          tmdb: { imageCount: 0, size: 0 },
          avatar: { imageCount: 0, size: 0 },
        },
        dnsCache: { entries: {} },
      },
    })
  );
  await page.route('**/api/v1/status/appdata', (route) =>
    route.fulfill({
      json: {
        appData: true,
        appDataWritable: true,
        appDataPath: '/config',
      },
    })
  );

  await page.goto('/settings/jobs');
  await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible();
  await expect(
    page.getByText('Plex Recently Added Scan', { exact: true })
  ).toBeVisible();
  const captureDir = process.env.LUMEN_NATIVE_JOBS_CAPTURE_DIR;
  if (captureDir) {
    await page.screenshot({
      path: `${captureDir}/native-jobs-desktop.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: `${captureDir}/native-jobs-phone.png`,
      fullPage: true,
    });
  }
});
