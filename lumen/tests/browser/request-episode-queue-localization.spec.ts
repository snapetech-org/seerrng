import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const locale = ['en', 'fr', 'ar'].includes(
  process.env.LUMEN_REQUEST_EPISODE_QUEUE_LOCALE ?? ''
)
  ? (process.env.LUMEN_REQUEST_EPISODE_QUEUE_LOCALE as 'en' | 'fr' | 'ar')
  : 'en';
const candidate = process.env.LUMEN_CAPTURE_MODE !== 'baseline';
const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const copy = {
  en: {
    title: 'Episode Queue',
    length: 'Queue Length',
    loading: 'Loading the account default…',
    save: 'Save Episode Queue',
    saved: 'Episode Queue saved.',
  },
  fr: {
    title: 'File d’attente des épisodes',
    length: 'Longueur de la file',
    loading: 'Chargement du réglage par défaut du compte…',
    save: 'Enregistrer la file d’attente',
    saved: 'File d’attente des épisodes enregistrée.',
  },
  ar: {
    title: 'قائمة انتظار الحلقات',
    length: 'طول القائمة',
    loading: 'جارٍ تحميل إعداد الحساب الافتراضي…',
    save: 'حفظ قائمة انتظار الحلقات',
    saved: 'تم حفظ قائمة انتظار الحلقات.',
  },
} as const;

test(`row Episode Queue editor follows the ${locale} locale`, async ({
  page,
}) => {
  let payload: unknown;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname
      .replace(/^\/lumen(?=\/)/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Manager', permissions: 2 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: candidate ? locale : 'en' } });
    if (path === '/settings/public')
      return route.fulfill({ json: { mediaServerType: 1 } });
    if (path === '/request/status')
      return route.fulfill({ status: 404, json: { message: 'Not needed' } });
    if (path === '/request')
      return route.fulfill({
        json: {
          pageInfo: { pages: 1, results: 1 },
          results: [
            {
              id: 618,
              type: 'tv',
              status: 2,
              is4k: false,
              createdAt: '2026-11-22T12:00:00.000Z',
              requestedBy: { id: 2, displayName: 'Requester' },
              media: { mediaType: 'tv', tmdbId: 22, status: 5 },
              watchAheadUsesUserDefault: false,
              watchAheadEpisodeCount: 1,
              seasons: [{ seasonNumber: 1, episodeNumbers: [1] }],
            },
          ],
        },
      });
    if (path === '/tv/22')
      return route.fulfill({ json: { id: 22, name: 'Fixture series' } });
    if (path === '/user/2/settings/episode-queue')
      return route.fulfill({ json: { defaultEpisodeCount: 2 } });
    if (path === '/request/618/episode-queue' && request.method() === 'POST') {
      payload = request.postDataJSON();
      return route.fulfill({
        json: { episodeCount: 3, usesUserDefault: false },
      });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(`${mount}/requests?tab=everyone`);
  await expect(page.locator('.rq').first()).toBeVisible();
  const expected = candidate ? copy[locale] : copy.en;
  await page.getByRole('button', { name: expected.title }).click();
  const dialog = page.getByRole('dialog', { name: expected.title });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(expected.length, { exact: true })
  ).toBeVisible();
  await expect(dialog.getByText(expected.loading)).toHaveCount(0);
  const capture = process.env.LUMEN_REQUEST_EPISODE_QUEUE_CAPTURE;
  if (capture) {
    await mkdir(dirname(capture), { recursive: true });
    await page.waitForTimeout(350);
    await page.screenshot({
      path: join(
        dirname(capture),
        `${basename(capture, '.png')}-${test.info().project.name}.png`
      ),
      fullPage: false,
    });
  }
  await dialog
    .getByRole('combobox', { name: expected.length })
    .selectOption('3');
  await dialog.getByRole('button', { name: expected.save }).click();
  await expect(page.getByText(expected.saved)).toBeVisible();
  expect(payload).toEqual({ episodeCount: 3 });
});
