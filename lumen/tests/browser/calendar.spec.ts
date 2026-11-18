import { expect, test } from '@playwright/test';

test.use({ locale: 'en-US', timezoneId: 'America/Los_Angeles' });

for (const permissions of [2, 32]) {
  test(`release calendar uses the selected interval and authorized scope for ${permissions}`, async ({
    page,
  }) => {
    let marchRequests = 0;
    const queries: URLSearchParams[] = [];
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/api/v1/**', (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.slice('/api/v1'.length);
      if (path === '/calendar') {
        queries.push(url.searchParams);
        if (queries.length === 1) return route.fulfill({ json: {} });
        if (url.searchParams.get('start') === '2026-03-01') {
          return route.fulfill({
            json: {
              results: [],
              partialSources:
                ++marchRequests === 1 ? [{ source: 'radarr' }] : [],
              truncated: false,
            },
          });
        }
        return route.fulfill({
          json: {
            partialSources: [{ source: 'radarr' }],
            truncated: false,
            results: [
              {
                id: 'readarr:1:11',
                title: 'Local Audiobook',
                bookId: 'bookshelf:1:fixture',
                bookFormat: 'audiobook',
                mediaType: 'book',
                dateType: 'book',
                allDay: true,
                available: false,
                startsAt: '2026-01-12T00:00:00.000Z',
              },
              {
                id: 'radarr:2:12',
                title: 'Fixture 4K Movie',
                tmdbId: 12,
                mediaType: 'movie',
                dateType: 'digital',
                allDay: true,
                available: false,
                is4k: true,
                startsAt: '2026-01-12T00:00:00.000Z',
              },
              {
                id: 'sonarr:1:9',
                title: 'Fixture Series',
                tmdbId: 42,
                mediaType: 'tv',
                dateType: 'air',
                allDay: false,
                available: false,
                is4k: true,
                seasonNumber: 2,
                episodeNumber: 3,
                startsAt: '2026-01-12T00:00:00.000Z',
              },
              {
                id: 'book:10',
                title: 'Fixture Audiobook',
                bookId: 'hc:10',
                bookFormat: 'audiobook',
                mediaType: 'book',
                dateType: 'book',
                allDay: true,
                available: false,
                startsAt: '2026-01-12T00:00:00.000Z',
              },
            ],
          },
        });
      }
      return route.fulfill({
        json:
          path === '/auth/me'
            ? { id: 1, displayName: 'Reader', permissions }
            : {},
      });
    });
    await page.goto('/me');
    await page.getByRole('link', { name: 'Open Release Calendar' }).click();
    await expect(
      page.getByRole('heading', { name: 'Release Calendar' })
    ).toBeVisible();
    const error = page.getByRole('alert').filter({
      hasText: 'Invalid release calendar response.',
    });
    await expect(error).toBeVisible();
    await error.getByRole('button', { name: 'Retry' }).click();
    await expect(
      page.getByRole('link', { name: 'Fixture 4K Movie' })
    ).toHaveAttribute('href', '/movie/12?quality=4k');
    await expect(
      page.getByRole('link', { name: 'Fixture Series' })
    ).toHaveAttribute('href', '/tv/42?quality=4k&episode=3#season-2');
    await expect(
      page
        .getByRole('listitem')
        .filter({ hasText: 'Fixture Series' })
        .locator('time')
    ).toHaveText(/Jan 11, 2026/);
    await expect(
      page.getByRole('link', { name: 'Fixture Audiobook' })
    ).toHaveAttribute('href', '/book/hc%3A10?f=audio');
    await expect(
      page
        .getByRole('listitem')
        .filter({ hasText: 'Fixture Audiobook' })
        .locator('time')
    ).toHaveText('Jan 12, 2026');
    await expect(
      page.getByRole('link', { name: 'Local Audiobook' })
    ).toHaveAttribute(
      'href',
      '/book/bookshelf%3A1%3Afixture?f=audio&lookupTitle=Local+Audiobook'
    );
    await expect(
      page.getByText('Some release sources could not be reached.', {
        exact: false,
      })
    ).toBeVisible();
    await page.getByLabel('Month', { exact: true }).fill('2026-01');
    await page.getByLabel('Media Type').selectOption('book');
    if (permissions === 2) {
      await page.getByLabel('Scope').selectOption('all');
      await page
        .getByRole('checkbox', { name: 'Include Unmonitored Titles' })
        .click();
      await expect(
        page.getByRole('checkbox', { name: 'Include Unmonitored Titles' })
      ).toBeChecked();
    } else {
      await expect(page.getByLabel('Scope')).toHaveCount(0);
      await expect(page.getByLabel('Include Unmonitored Titles')).toHaveCount(
        0
      );
    }
    await expect
      .poll(() => Object.fromEntries(queries.at(-1) ?? []))
      .toMatchObject({
        start: '2026-01-01',
        end: '2026-02-01',
        timeZone: 'America/Los_Angeles',
        mediaType: 'book',
        scope: permissions === 2 ? 'all' : 'mine',
        includeUnmonitored: String(permissions === 2),
      });
    await page.goto(
      '/calendar?month=2026-02&mediaType=tv&scope=all&includeUnmonitored=true'
    );
    await expect(page.getByLabel('Month', { exact: true })).toHaveValue(
      '2026-02'
    );
    await expect(
      page.getByRole('combobox', { name: 'Media Type' })
    ).toHaveValue('tv');
    await expect
      .poll(() => Object.fromEntries(queries.at(-1) ?? []))
      .toMatchObject({
        start: '2026-02-01',
        end: '2026-03-01',
        mediaType: 'tv',
        scope: permissions === 2 ? 'all' : 'mine',
        includeUnmonitored: String(permissions === 2),
      });
    await page.getByRole('button', { name: 'Next Month' }).click();
    await expect(page.getByLabel('Month', { exact: true })).toHaveValue(
      '2026-03'
    );
    await expect(
      page.getByText('No releases were returned by the sources that responded.')
    ).toBeVisible();
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(
      page.getByText('No releases were returned by the sources that responded.')
    ).toHaveCount(0);
    await page.goBack();
    await expect(page.getByLabel('Month', { exact: true })).toHaveValue(
      '2026-02'
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
}
