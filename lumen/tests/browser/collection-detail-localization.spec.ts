import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;
const apiPath = (url: string) =>
  new URL(url).pathname.replace(/^\/lumen(?=\/)/, '').slice('/api/v1'.length);

const copy = {
  en: {
    count: '1 movie',
    movies: 'Movies',
    watch: 'Watch Trailer',
    blocklist: 'Blocklist Collection',
    confirm: 'Blocklist this collection?',
    explanation:
      'New requests for all movies in this collection will be blocked.',
    blocked: '1 of 1 blocklisted',
    added: 'Collection added to the Blocklist.',
  },
  fr: {
    count: '1 film',
    movies: 'Films',
    watch: 'Regarder la bande-annonce',
    blocklist: 'Bloquer la collection',
    confirm: 'Bloquer cette collection ?',
    explanation:
      'Les nouvelles demandes pour tous les films de cette collection seront bloquées.',
    blocked: '1 sur 1 dans la liste de blocage',
    added: 'Collection ajoutée à la liste de blocage.',
  },
  ar: {
    count: 'فيلم واحد (1)',
    movies: 'الأفلام',
    watch: 'مشاهدة الإعلان الترويجي',
    blocklist: 'حظر المجموعة',
    confirm: 'هل تريد حظر هذه المجموعة؟',
    explanation: 'سيتم حظر الطلبات الجديدة لجميع الأفلام في هذه المجموعة.',
    blocked: '1 من 1 في قائمة الحظر',
    added: 'أُضيفت المجموعة إلى قائمة الحظر.',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`collection detail follows the saved ${locale} locale`, async ({
    page,
  }, info) => {
    const text = copy[locale];
    const captureDirectory = process.env.LUMEN_COLLECTION_DETAIL_CAPTURE_DIR;
    let blocked = false;
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const path = apiPath(request.url());
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions: 2 } });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public')
        return route.fulfill({
          json: {
            initialized: true,
            youtubeUrl: 'https://video.example/watch?v=',
          },
        });
      if (path === '/collection/30')
        return route.fulfill({
          json: {
            id: 30,
            name: 'Fixture Collection',
            parts: [
              {
                id: 20,
                mediaType: 'movie',
                title: 'Fixture Movie',
                mediaInfo: { status: blocked ? 6 : 1 },
              },
            ],
          },
        });
      if (path === '/movie/20')
        return route.fulfill({
          json: {
            relatedVideos: [
              { type: 'Trailer', site: 'YouTube', key: 'AbCdEf12345' },
            ],
          },
        });
      if (path === '/blocklist/collection/30' && request.method() === 'POST') {
        blocked = true;
        return route.fulfill({ status: 201 });
      }
      return route.fulfill({ json: {} });
    });

    await page.goto(appPath('/collection/30'));
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(
      page.getByRole('heading', { name: 'Fixture Collection' })
    ).toBeVisible();
    await expect(page.getByText(text.count, { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: text.movies })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: text.watch })).toHaveAttribute(
      'href',
      'https://video.example/watch?v=AbCdEf12345'
    );
    await expect(
      page.getByRole('button', { name: text.blocklist, exact: true })
    ).toBeVisible();
    if (captureDirectory && ['desktop', 'iphone'].includes(info.project.name))
      await page.screenshot({
        path: `${captureDirectory}/${locale}-${info.project.name}.png`,
        fullPage: true,
        animations: 'disabled',
      });

    await page
      .getByRole('button', { name: text.blocklist, exact: true })
      .click();
    const confirmation = page.getByRole('alertdialog');
    await expect(confirmation.getByText(text.confirm)).toBeVisible();
    await expect(confirmation.getByText(text.explanation)).toBeVisible();
    await confirmation.getByRole('button', { name: text.blocklist }).click();
    await expect(page.getByText(text.blocked, { exact: true })).toBeVisible();
    await expect(page.getByText(text.added)).toBeVisible();
  });
}
