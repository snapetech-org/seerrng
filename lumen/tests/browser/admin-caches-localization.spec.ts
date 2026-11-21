import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

test('system caches follow the saved locale and confirm DNS flush readback', async ({
  page,
}) => {
  const baseline = process.env.LUMEN_CAPTURE_MODE === 'baseline';
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_CACHES_LOCALE ?? ''
  )
    ? (process.env.LUMEN_CACHES_LOCALE as 'en' | 'fr' | 'ar')
    : 'en';
  const translatedLabels = {
    en: {
      title: 'System Caches',
      api: 'API Caches',
      images: 'Image Caches',
      dns: 'DNS Cache',
      apiFlush: 'Flush Cache',
      noApiCaches: 'No API caches.',
      apiSuccess: 'Flushed TMDB.',
      flushEntry: 'Flush DNS Entry',
      confirm: 'Flush Cache?',
      action: 'Flush',
      success: 'Flushed cache.example.',
      empty: 'No DNS cache entries.',
    },
    fr: {
      title: 'Caches système',
      api: 'Caches API',
      images: 'Caches d’images',
      dns: 'Cache DNS',
      apiFlush: 'Vider le cache',
      noApiCaches: 'Aucun cache API.',
      apiSuccess: 'Cache TMDB vidé.',
      flushEntry: 'Vider l’entrée DNS',
      confirm: 'Vider le cache ?',
      action: 'Vider',
      success: 'Entrée DNS cache.example vidée.',
      empty: 'Aucune entrée DNS en cache.',
    },
    ar: {
      title: 'ذاكرات النظام المؤقتة',
      api: 'ذاكرات API المؤقتة',
      images: 'ذاكرات الصور المؤقتة',
      dns: 'ذاكرة تخزين DNS المؤقتة',
      apiFlush: 'محو الملفات المؤقتة',
      noApiCaches: 'لا توجد ذاكرات API مؤقتة.',
      apiSuccess: 'تم مسح TMDB.',
      flushEntry: 'مسح إدخال DNS',
      confirm: 'مسح الذاكرة المؤقتة؟',
      action: 'مسح',
      success: 'تم مسح إدخال DNS cache.example.',
      empty: 'لا توجد إدخالات DNS مخزنة مؤقتًا.',
    },
  }[locale];
  const labels = baseline
    ? {
        title: 'System Caches',
        api: 'API Caches',
        images: 'Image Caches',
        dns: 'DNS Cache',
        apiFlush: 'Flush Cache',
        noApiCaches: 'No API caches.',
        apiSuccess: 'Flushed TMDB.',
        flushEntry: 'Flush DNS Entry',
        confirm: 'Flush Cache?',
        action: 'Flush',
        success: 'Flushed cache.example.',
        empty: 'No DNS cache entries.',
      }
    : translatedLabels;
  let flushed = false;
  let apiFlushed = false;
  let reads = 0;
  const writes: string[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/lumen/, '');
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path.endsWith('/user/1/settings/main'))
      return route.fulfill({ json: { locale } });
    if (path.endsWith('/settings/cache/dns/cache.example/flush')) {
      expect(request.method()).toBe('POST');
      writes.push(path.replace(/^\/api\/v1/, ''));
      flushed = true;
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith('/settings/cache/tmdb/flush')) {
      expect(request.method()).toBe('POST');
      writes.push(path.replace(/^\/api\/v1/, ''));
      apiFlushed = true;
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith('/settings/cache')) {
      reads++;
      return route.fulfill({
        json: {
          apiCaches: apiFlushed
            ? []
            : [
                {
                  id: 'tmdb',
                  name: 'TMDB',
                  stats: { hits: 1234, misses: 5, keys: 6, ksize: 7, vsize: 8 },
                },
              ],
          imageCache: {
            tmdb: { imageCount: 9, size: 1000 },
            avatar: { imageCount: 1, size: 20 },
          },
          dnsCache: {
            stats: {
              size: 1,
              hits: 10,
              misses: 2,
              failures: 0,
              ipv4Fallbacks: 1,
              hitRate: 0.833,
            },
            entries: flushed
              ? {}
              : {
                  'cache.example': {
                    activeAddress: '192.0.2.1',
                    hits: 10,
                    misses: 2,
                    age: 3000,
                  },
                },
          },
        },
      });
    }
    if (path.endsWith('/status/appdata'))
      return route.fulfill({ json: { appDataPath: '/data/fixture/' } });
    return route.fulfill({ json: {} });
  });
  await page.goto(appPath('/admin/caches'));
  await expect(
    page.getByRole('heading', { name: labels.title, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: labels.api, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: labels.images, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: labels.dns, exact: true })
  ).toBeVisible();
  await expect(page.getByText('/data/fixture/cache/images')).toBeVisible();
  await expect(page.getByText(/1234|1[,\u202f٬]234|١٬٢٣٤/)).toBeVisible();
  if (process.env.LUMEN_CAPTURE_CACHES)
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_CACHES}/${locale}-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
  await page
    .getByRole('button', { name: labels.flushEntry, exact: true })
    .click();
  expect(flushed).toBe(false);
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByText(labels.confirm, { exact: true })).toBeVisible();
  await dialog
    .getByRole('button', { name: labels.action, exact: true })
    .click();
  if (locale === 'ar')
    await expect(
      page.getByRole('status').filter({ hasText: 'تم مسح إدخال DNS' })
    ).toBeVisible();
  else
    await expect(page.getByText(labels.success, { exact: true })).toBeVisible();
  await expect(page.getByText(labels.empty, { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: labels.apiFlush, exact: true })
    .click();
  const apiDialog = page.getByRole('alertdialog');
  await apiDialog
    .getByRole('button', { name: labels.action, exact: true })
    .click();
  await expect(
    page.getByText(labels.apiSuccess, { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(labels.noApiCaches, { exact: true })
  ).toBeVisible();
  expect(writes).toEqual([
    '/settings/cache/dns/cache.example/flush',
    '/settings/cache/tmdb/flush',
  ]);
  expect(reads).toBeGreaterThanOrEqual(3);
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});
