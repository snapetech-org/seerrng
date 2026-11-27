import { expect, test, type Page } from '@playwright/test';
import { testAppPath } from './testAppPath';

const title = 'Fixture Title';
const serviceEndpoint = '/service/reader-delivery';

async function fixture(page: Page, service: unknown, locale = 'en') {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(7);
    const entries: Record<string, unknown> = {
      '/auth/me': { id: 1, permissions: 32 },
      '/user/1/settings/main': { locale },
      '/settings/public': {
        comicsEnabled: true,
        magazinesEnabled: true,
        enabledMediaCategories: { comic: true, magazine: true },
      },
      '/book/OL11W': { id: 'OL11W', title, author: 'Fixture Author' },
      '/comic/work/al-1': {
        id: 'al-1',
        title,
        kind: 'manga',
        editions: [{ id: '11', title, recommended: true }],
      },
      '/comic/11/issues': {
        results: [],
        page: 1,
        totalPages: 1,
        totalResults: 0,
      },
      '/magazine/Fixture': { id: 'mag1', title, issues: [] },
      [serviceEndpoint]: service,
    };
    return route.fulfill({ json: entries[path] ?? {} });
  });
}

const cases = [
  {
    path: '/book/OL11W',
    label: { en: 'Ebooks', fr: 'Livres numériques', ar: 'الكتب الإلكترونية' },
    name: 'Ebooks',
    provider: 'bookorbit',
  },
  {
    path: '/book/OL11W?f=audio',
    label: { en: 'Audiobooks', fr: 'Livres audio', ar: 'الكتب الصوتية' },
    name: 'Audiobooks',
    provider: 'grimmory',
  },
  {
    path: '/comic/al-1',
    label: { en: 'Comics', fr: 'Bandes dessinées', ar: 'القصص المصورة' },
    name: 'Comics',
    provider: 'grimmory',
  },
  {
    path: '/magazine/Fixture',
    label: {
      en: 'Magazine PDFs',
      fr: 'PDF de magazines',
      ar: 'ملفات المجلات PDF',
    },
    name: 'Magazine PDFs',
    provider: 'bookorbit',
  },
] as const;

for (const { path, label, name: mediaName, provider } of cases) {
  for (const locale of ['en', 'fr', 'ar'] as const) {
    test(`${mediaName} reader action is localized in ${locale}`, async ({
      page,
    }, info) => {
      const serviceName = provider === 'grimmory' ? 'Grimmory' : 'BookOrbit';
      await fixture(
        page,
        {
          provider,
          serviceUrl: `https://${provider}.example.test/library/api/v1/opds/`,
          grimmoryUrl: 'https://grimmory.example.test/library/komga/api',
        },
        locale
      );
      await page.goto(testAppPath(path));
      const expected =
        locale === 'en'
          ? `Browse ${label[locale]} in ${serviceName}`
          : locale === 'fr'
            ? `Parcourir ${label[locale]} sur ${serviceName}`
            : `تصفح ${label[locale]} في ${serviceName}`;
      const link = page.getByRole('link', { name: expected });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute(
        'href',
        `https://${provider}.example.test/library`
      );
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      await page.screenshot({
        path: info.outputPath('reader-link.png'),
        fullPage: true,
      });
    });

    test(`${mediaName} hides unsafe reader addresses in ${locale}`, async ({
      page,
    }, info) => {
      const serviceName = provider === 'grimmory' ? 'Grimmory' : 'BookOrbit';
      await fixture(
        page,
        {
          provider,
          serviceUrl: 'https://account:secret@reader.example.test',
          grimmoryUrl: null,
        },
        locale
      );
      const response = page.waitForResponse((response) =>
        new URL(response.url()).pathname.endsWith(serviceEndpoint)
      );
      await page.goto(testAppPath(path));
      await response;
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
      const phrase =
        locale === 'en'
          ? `Browse ${label[locale]} in ${serviceName}`
          : locale === 'fr'
            ? `Parcourir ${label[locale]} sur ${serviceName}`
            : `تصفح ${label[locale]} في ${serviceName}`;
      await expect(page.getByRole('link', { name: phrase })).toHaveCount(0);
      await page.screenshot({
        path: info.outputPath('reader-link-unavailable.png'),
        fullPage: true,
      });
    });
  }
}
