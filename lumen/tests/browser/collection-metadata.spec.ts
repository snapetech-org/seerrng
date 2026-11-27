import { expect, test } from '@playwright/test';
import { testAppPath as mountedTestAppPath } from './testAppPath';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

const copy = {
  en: {
    cast: 'Cast',
    crew: 'Crew',
    tags: 'Subject Tags',
    loading: 'Loading collection details…',
    partial: 'Some movie details could not be loaded.',
    retry: 'Retry',
    castPin: 'Keep Cast Open',
  },
  fr: {
    cast: 'Distribution',
    crew: 'Équipe',
    tags: 'Mots-clés',
    loading: 'Chargement des détails de la collection…',
    partial: 'Certains détails de films n’ont pas pu être chargés.',
    retry: 'Réessayer',
    castPin: 'Garder « Distribution » ouvert',
  },
  ar: {
    cast: 'طاقم التمثيل',
    crew: 'طاقم العمل',
    tags: 'الوسوم',
    loading: 'جارٍ تحميل تفاصيل المجموعة…',
    partial: 'تعذر تحميل بعض تفاصيل الأفلام.',
    retry: 'إعادة المحاولة',
    castPin: 'إبقاء «طاقم التمثيل» مفتوحًا',
  },
} as const;
const viewports = {
  desktop: { width: 1440, height: 900 },
  iphone: { width: 390, height: 844 },
  android: { width: 412, height: 915 },
  tablet: { width: 834, height: 1194 },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`movie collection metadata disclosures follow ${locale}`, async ({
    page,
  }, info) => {
    const labels = copy[locale];
    const pins: Record<string, boolean> = {};
    const movieReads: number[] = [];
    let movie21Failures = 1;
    await page.setViewportSize(
      viewports[info.project.name as keyof typeof viewports] ??
        viewports.desktop
    );
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.slice('/api/v1'.length);
      if (path === '/auth/me')
        return route.fulfill({
          json: {
            id: 1,
            permissions: 2,
            settings: { detailDisclosurePins: { movie: pins } },
          },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public')
        return route.fulfill({
          json: { youtubeUrl: 'https://video.example/watch?v=' },
        });
      if (path === '/collection/30')
        return route.fulfill({
          json: {
            id: 30,
            name: 'Fixture Collection',
            parts: [
              { id: 20, mediaType: 'movie', title: 'First Movie' },
              { id: 21, mediaType: 'movie', title: 'Second Movie' },
            ],
          },
        });
      if (path === '/movie/20' || path === '/movie/21') {
        const id = Number(path.slice('/movie/'.length));
        movieReads.push(id);
        if (id === 21 && movie21Failures > 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          movie21Failures -= 1;
          return route.fulfill({ status: 502, json: { error: 'unavailable' } });
        }
        if (id === 21) await new Promise((resolve) => setTimeout(resolve, 100));
        return route.fulfill({
          json:
            id === 20
              ? {
                  id,
                  title: 'First Movie',
                  relatedVideos: [
                    { type: 'Trailer', site: 'YouTube', key: 'AbCdEf12345' },
                  ],
                  credits: {
                    cast: [
                      { id: 101, name: 'Ada Performer', character: 'Pilot' },
                      { id: 102, name: 'Shared Performer', character: 'Guide' },
                    ],
                    crew: [
                      { id: 201, name: 'Morgan Director', job: 'Director' },
                    ],
                  },
                  keywords: [{ id: 301, name: 'Space Opera' }],
                }
              : {
                  id,
                  title: 'Second Movie',
                  credits: {
                    cast: [
                      { id: 102, name: 'Shared Performer', character: 'Guide' },
                      { id: 103, name: 'Bea Performer', character: 'Engineer' },
                    ],
                    crew: [{ id: 202, name: 'Lee Writer', job: 'Writer' }],
                  },
                  keywords: [
                    { id: 301, name: 'Space Opera' },
                    { id: 302, name: 'Found Family' },
                  ],
                },
        });
      }
      if (
        path === '/user/1/settings/detail-disclosures/movie' &&
        request.method() === 'POST'
      ) {
        Object.assign(pins, request.postDataJSON());
        return route.fulfill({ json: pins });
      }
      return route.fulfill({ json: {} });
    });

    await page.goto(mountedTestAppPath('/collection/30'));
    await expect(
      page.getByRole('heading', { name: 'Fixture Collection' })
    ).toBeVisible();
    const cast = page.getByTestId('collection-cast');
    const crew = page.getByTestId('collection-crew');
    const tags = page.getByTestId('collection-subject-tags');
    await expect(cast).not.toHaveAttribute('open', '');
    await expect(crew).not.toHaveAttribute('open', '');
    await expect(tags).not.toHaveAttribute('open', '');
    expect(movieReads).toEqual([20]);
    const capture = process.env.LUMEN_COLLECTION_METADATA_CAPTURE_DIR;
    if (capture && ['desktop', 'iphone'].includes(info.project.name)) {
      if (process.env.LUMEN_COLLECTION_METADATA_BASELINE === 'true') {
        await page.addStyleTag({
          content:
            'details[data-testid^="collection-"] { display: none !important; }',
        });
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `${capture}/${locale}-${info.project.name}-closed.png`,
        fullPage: true,
      });
      if (process.env.LUMEN_COLLECTION_METADATA_BASELINE === 'true') return;
    }

    await cast.locator('summary').click();
    await expect(
      cast.getByRole('status').getByText(labels.loading)
    ).toBeVisible();
    await expect(
      cast.getByRole('link', { name: 'Ada Performer' })
    ).toBeVisible();
    await expect(
      cast.getByRole('link', { name: 'Shared Performer' })
    ).toHaveCount(1);
    await expect(cast.getByRole('link', { name: 'Bea Performer' })).toHaveCount(
      0
    );
    await expect(
      cast.getByRole('status').getByText(labels.partial)
    ).toBeVisible();
    await cast.getByRole('button', { name: labels.retry }).click();
    await expect(
      cast.getByRole('link', { name: 'Bea Performer' })
    ).toBeVisible();
    expect(movieReads.sort()).toEqual([20, 21, 21]);
    await crew.locator('summary').click();
    await expect(
      crew.getByRole('link', { name: 'Morgan Director' })
    ).toBeVisible();
    await expect(crew.getByRole('link', { name: 'Lee Writer' })).toBeVisible();
    await tags.locator('summary').click();
    await expect(
      tags.getByRole('link', { name: 'Space Opera', exact: true })
    ).toHaveAttribute('href', appPath('/movies?keywords=301'));
    await expect(
      tags.getByRole('link', { name: 'Space Opera', exact: true })
    ).toHaveCount(1);
    await expect(
      tags.getByRole('link', { name: 'Found Family', exact: true })
    ).toHaveAttribute('href', appPath('/movies?keywords=302'));
    if (capture && ['desktop', 'iphone'].includes(info.project.name)) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `${capture}/${locale}-${info.project.name}-open.png`,
        fullPage: true,
      });
    }

    const pin = cast.getByRole('button', { name: labels.castPin });
    await pin.click();
    await expect(pin).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.getByTestId('collection-cast')).toHaveAttribute(
      'open',
      ''
    );
    await expect(
      page.getByTestId('collection-cast').getByRole('link', {
        name: 'Ada Performer',
      })
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth
      )
    ).toBe(true);
  });
}
