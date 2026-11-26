import { expect, test } from '@playwright/test';
import { formatBytes } from '../../../src/utils/numberHelpers';

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
      apiDescription:
        'SeerrNG caches responses from external API endpoints to improve performance and reduce repeated calls.',
      imageDescription:
        'Cached images are stored in SeerrNG application storage.',
      dnsDescription:
        'SeerrNG caches DNS lookups to reduce repeated requests when connecting to services.',
      dnsStatsDescription:
        'These statistics are aggregated across all DNS cache entries.',
      dns: 'DNS Cache',
      cacheMaxEntries: 'Maximum Entries',
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
      apiDescription:
        'SeerrNG met en cache les réponses des API externes afin d’améliorer les performances et de réduire les appels répétés.',
      imageDescription:
        'Les images en cache sont stockées dans l’espace de stockage de SeerrNG.',
      dnsDescription:
        'SeerrNG met en cache les recherches DNS pour réduire les requêtes lors des connexions aux services.',
      dnsStatsDescription:
        'Ces statistiques sont agrégées pour toutes les entrées du cache DNS.',
      dns: 'Cache DNS',
      cacheMaxEntries: 'Nombre maximal d’entrées',
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
      apiDescription:
        'يخزّن SeerrNG مؤقتًا استجابات واجهات API الخارجية لتحسين الأداء وتقليل الطلبات المتكررة.',
      imageDescription: 'تُحفظ الصور المخزنة مؤقتًا ضمن مساحة تخزين SeerrNG.',
      dnsDescription:
        'يخزّن SeerrNG مؤقتًا نتائج DNS لتقليل الطلبات المتكررة عند الاتصال بالخدمات.',
      dnsStatsDescription:
        'هذه الإحصاءات مجمّعة من جميع إدخالات ذاكرة DNS المؤقتة.',
      dns: 'ذاكرة تخزين DNS المؤقتة',
      cacheMaxEntries: 'الحد الأقصى للإدخالات',
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
        apiDescription:
          'SeerrNG caches responses from external API endpoints to improve performance and reduce repeated calls.',
        imageDescription:
          'Cached images are stored in SeerrNG application storage.',
        dnsDescription:
          'SeerrNG caches DNS lookups to reduce repeated requests when connecting to services.',
        dnsStatsDescription:
          'These statistics are aggregated across all DNS cache entries.',
        dns: 'DNS Cache',
        cacheMaxEntries: 'cacheMaxEntries',
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
                  stats: {
                    hits: 1234,
                    misses: 5,
                    keys: 6,
                    ksize: 2048,
                    vsize: 4096,
                  },
                },
              ],
          imageCache: {
            tmdb: { imageCount: 9, size: 2048 },
            avatar: { imageCount: 1, size: 20 },
          },
          dnsCache: {
            stats: {
              size: 1,
              cacheMaxEntries: 256,
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
                    age: 3600000,
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
  if (!baseline) {
    await expect(
      page.getByText(labels.cacheMaxEntries, { exact: true })
    ).toBeVisible();
    await expect(page.getByText('256', { exact: true })).toBeVisible();
    const age = new Intl.RelativeTimeFormat(locale, {
      numeric: 'auto',
    }).format(-1, 'hour');
    await expect(
      page.locator('.set').filter({ hasText: 'cache.example' })
    ).toContainText(age);
    for (const description of [
      labels.apiDescription,
      labels.imageDescription,
      labels.dnsDescription,
      labels.dnsStatsDescription,
    ])
      await expect(page.getByText(description, { exact: true })).toBeVisible();
  }
  await expect(page.getByText('/data/fixture/cache/images')).toBeVisible();
  await expect(page.getByText(/1234|1[,\u202f٬]234|١٬٢٣٤/)).toBeVisible();
  if (!baseline) {
    await expect(
      page.getByText(
        `${formatBytes(2048, 2, locale)} · ${formatBytes(4096, 2, locale)}`,
        { exact: true }
      )
    ).toBeVisible();
    await expect(
      page.locator('.set').filter({ hasText: formatBytes(2048, 2, locale) })
    ).toHaveCount(2);
  }
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
