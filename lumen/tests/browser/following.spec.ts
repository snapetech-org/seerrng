import { expect, test } from '@playwright/test';

test('household users can open Following and manage their own updates', async ({
  page,
  baseURL,
}) => {
  let seen = false;
  let patchSeen = false;
  let notify = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Reader', permissions: 32 },
      });
    if (path === '/follow/events/seen') {
      const payload = route.request().postDataJSON();
      if (payload.ids[0] === 4) {
        expect(payload).toEqual({ ids: [4] });
        patchSeen = true;
      } else {
        expect(payload).toEqual({ ids: [1] });
        seen = true;
      }
      return route.fulfill({ status: 204 });
    }
    if (path === '/follow/2' && route.request().method() === 'PATCH') {
      expect(route.request().postDataJSON()).toEqual({ notify: false });
      notify = false;
      return route.fulfill({ status: 204 });
    }
    if (path === '/follow/events/count')
      return route.fulfill({
        json: { unseen: Number(!seen) + Number(!patchSeen) },
      });
    if (path === '/follow/events')
      return route.fulfill({
        json: {
          total: 4,
          results: [
            {
              id: 1,
              title: 'A New Film',
              seen,
              follow: { subjectLabel: 'Example Director' },
              target: { mediaType: 'movie', id: '10' },
            },
            {
              id: 3,
              title: 'New Story Expansion',
              reasonKey: 'newExpansion',
              reasonValues: { game: 'Fixture Game' },
              seen: true,
              follow: { subjectLabel: 'Fixture Game', kind: 'expansion' },
              target: { mediaType: 'game', id: '42' },
            },
            {
              id: 4,
              title: 'Translation Patch 2',
              seen: patchSeen,
              follow: {
                subjectLabel: 'Translation Patch',
                kind: 'patch-project',
              },
              reasonKey: 'newPatchVersion',
              reasonValues: {
                project: 'Translation Patch',
                version: '2',
                game: 'Fixture Game',
              },
              target: {
                mediaType: 'patch',
                id: 'translation',
                variantKey: 'v2',
              },
            },
            {
              id: 5,
              title: 'Next Volume Announced',
              seen: true,
              follow: {
                subjectLabel: 'Fixture Novel',
                kind: 'series-language',
              },
              target: { mediaType: 'search', id: 'Fixture Novel Volume 4' },
            },
          ],
        },
      });
    if (path === '/follow')
      return route.fulfill({
        json: {
          results: [
            {
              id: 2,
              kind: 'tmdb-person',
              subjectLabel: 'Example Director',
              conditions: { ref: { tmdbId: 77 } },
              notify,
              autoRequest: false,
            },
          ],
        },
      });
    return route.fulfill({ json: {} });
  });

  await page.goto('./me');
  await page.getByRole('link', { name: 'Open Following', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Following', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'A New Film' })).toHaveAttribute(
    'href',
    new URL('./movie/10', baseURL).pathname
  );
  await expect(
    page.getByRole('link', { name: 'New Story Expansion' })
  ).toHaveAttribute('href', new URL('./game/game/42', baseURL).pathname);
  await expect(
    page.getByText('New content for Fixture Game: New Story Expansion.')
  ).toBeVisible();
  await expect(
    page.getByText('Translation Patch 2 is available for Fixture Game.')
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Translation Patch 2', exact: true })
  ).toHaveAttribute(
    'href',
    new URL('./patches/translation', baseURL).pathname + '?version=v2'
  );
  await expect(
    page.getByRole('link', { name: 'Next Volume Announced', exact: true })
  ).toHaveAttribute(
    'href',
    new URL('./search', baseURL).pathname + '?q=Fixture%20Novel%20Volume%204'
  );
  await page.getByRole('button', { name: 'Mark Seen: A New Film' }).click();
  await expect(
    page.getByRole('button', { name: 'Mark Seen: A New Film' })
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Example Director' })
  ).toHaveAttribute('href', new URL('./person/77', baseURL).pathname);
  const notification = page.getByRole('checkbox', { name: 'Notify Me' });
  await expect(notification).toBeChecked();
  await notification.click();
  await expect(notification).not.toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Request Automatically' })
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page
    .getByRole('link', { name: 'Translation Patch 2', exact: true })
    .click();
  await expect(page).toHaveURL('./patches/translation?version=v2');
  await expect.poll(() => patchSeen).toBe(true);
});

test('direct navigation without request access does not fetch follows', async ({
  page,
}) => {
  let requested = false;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(7);
    requested ||= path.startsWith('/follow');
    return route.fulfill({
      json:
        path === '/auth/me'
          ? { id: 1, displayName: 'Viewer', permissions: 4 }
          : {},
    });
  });
  await page.goto('./following');
  await expect(
    page.getByText('Request access is required to use Following.')
  ).toBeVisible();
  expect(requested).toBe(false);
});

test('following a person uses the exact identity and waits for server confirmation', async ({
  page,
}) => {
  const person = { id: 77, name: 'Example Director' };
  let followed = false;
  let fail = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(7);
    const record = { id: 2, kind: 'tmdb-person', subjectKey: 'tmdb:person:77' };
    if (path === '/follow' && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual({
        kind: 'tmdb-person',
        subjectKey: 'tmdb:person:77',
        subjectLabel: person.name,
        conditions: { ref: { tmdbId: 77 } },
      });
      if (fail)
        return route.fulfill({ status: 500, json: { message: 'Try again' } });
      followed = true;
      return route.fulfill({ status: 201, json: record });
    }
    if (path === '/follow/2' && request.method() === 'DELETE') {
      followed = false;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({
      json:
        path === '/auth/me'
          ? { id: 1, displayName: 'Reader', permissions: 32 }
          : path === '/person/77'
            ? person
            : path === '/follow'
              ? { results: followed ? [record] : [] }
              : {},
    });
  });
  await page.goto('./person/77');
  const follow = page.getByRole('button', { name: 'Follow', exact: true });
  await follow.click();
  await expect(page.getByRole('status')).toContainText('Try again');
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
  fail = false;
  await follow.click();
  const following = page.getByRole('button', {
    name: 'Following',
    exact: true,
  });
  await expect(following).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(following).toHaveAttribute('aria-pressed', 'true');
  await following.click();
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
});

test('filtered discovery follows the exact genre, studio, and network', async ({
  page,
}) => {
  const posted: unknown[] = [];
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 32 } });
    if (path === '/genres/tv') return route.fulfill({ json: [] });
    if (path === '/genres/movie')
      return route.fulfill({ json: [{ id: 18, name: 'Drama' }] });
    if (path === '/studio/72')
      return route.fulfill({ json: { id: 72, name: 'Fixture Studio' } });
    if (path === '/network/900009')
      return route.fulfill({ json: { id: 900009, name: 'Fixture Network' } });
    if (path === '/follow' && request.method() === 'POST') {
      const subject = request.postDataJSON();
      posted.push(subject);
      return route.fulfill({ json: { ...subject, id: posted.length } });
    }
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto('./movies?genre=18&studio=72');
  await page.getByRole('button', { name: 'Follow Drama', exact: true }).click();
  await page
    .getByRole('button', { name: 'Follow Fixture Studio', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Following', exact: true })
  ).toHaveCount(2);
  await page.goto('./series?network=900009');
  await page
    .getByRole('button', { name: 'Follow Fixture Network', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Following', exact: true })
  ).toHaveCount(1);
  expect(posted).toEqual([
    {
      kind: 'tmdb-genre',
      subjectKey: 'tmdb:genre:movie:18',
      subjectLabel: 'Drama',
      conditions: { ref: { genreId: 18, mediaType: 'movie' } },
    },
    {
      kind: 'tmdb-studio',
      subjectKey: 'tmdb:studio:72',
      subjectLabel: 'Fixture Studio',
      conditions: { ref: { tmdbId: 72 } },
    },
    {
      kind: 'tmdb-network',
      subjectKey: 'tmdb:network:900009',
      subjectLabel: 'Fixture Network',
      conditions: { ref: { tmdbId: 900009 } },
    },
  ]);
});

test('book details follow the author by catalog identity', async ({ page }) => {
  const subject = {
    kind: 'author',
    subjectKey: 'author:OL7A',
    subjectLabel: 'Fixture Author',
    conditions: { ref: { authorId: 'OL7A' } },
  };
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 32 } });
    if (path === '/settings/public')
      return route.fulfill({
        json: { booksEnabled: true, ebookServiceEnabled: true },
      });
    if (path === '/book/OL42W')
      return route.fulfill({
        json: {
          id: 'OL42W',
          title: 'Fixture Book',
          authorId: 'OL7A',
          author: 'Fixture Author',
          mediaType: 'book',
          bookFormat: 'ebook',
        },
      });
    if (path === '/follow' && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual(subject);
      return route.fulfill({ json: { ...subject, id: 6 } });
    }
    if (path === '/follow/6' && request.method() === 'DELETE')
      return route.fulfill({ status: 204 });
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto('./book/OL42W');
  const follow = page.getByRole('button', { name: 'Follow New Releases' });
  await follow.click();
  const following = page.getByRole('button', {
    name: 'Following',
    exact: true,
  });
  await expect(following).toHaveAttribute('aria-pressed', 'true');
  await following.click();
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
});

test('an audiobook can follow a solo narrator without selecting an edition', async ({
  page,
}) => {
  const subject = {
    kind: 'narrator',
    subjectKey: 'narrator:fixture reader',
    subjectLabel: 'Fixture Reader',
  };
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 32 } });
    if (path === '/settings/public')
      return route.fulfill({
        json: { booksEnabled: true, audiobookServiceEnabled: true },
      });
    if (path === '/editions/book')
      return route.fulfill({
        json: {
          editions: [
            {
              id: 'solo',
              title: 'Solo edition',
              format: 'audiobook',
              language: 'en',
              narrators: ['Fixture Reader'],
            },
            {
              id: 'cast',
              title: 'Cast edition',
              format: 'audiobook',
              language: 'en',
              narrators: ['Full Cast'],
            },
          ],
        },
      });
    if (path.startsWith('/book/') && !path.endsWith('/ratings'))
      return route.fulfill({
        json: {
          id: 'bookshelf:1:aGM6MjYwNDY4',
          title: 'Fixture Audiobook',
          mediaType: 'book',
          bookFormat: 'audiobook',
          description: 'Fixture description.',
        },
      });
    if (path === '/follow' && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual(subject);
      return route.fulfill({ json: { ...subject, id: 7 } });
    }
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto('./book/bookshelf:1:aGM6MjYwNDY4?f=audio');
  const narrations = page.getByRole('radiogroup', { name: 'Narrations' });
  await expect(narrations).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Follow Full Cast' })
  ).toHaveCount(0);
  const cast = narrations.getByRole('radio', { name: /Full Cast/ });
  await cast.click();
  await expect(cast).toBeChecked();
  await page.getByRole('button', { name: 'Follow Fixture Reader' }).click();
  await expect(
    page.getByRole('button', { name: 'Following', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(cast).toBeChecked();
});

test('anime continuation loads on demand and follows the novel in its language', async ({
  page,
}) => {
  const subject = {
    kind: 'series-language',
    subjectKey: 'ranobedb:81:en',
    subjectLabel: 'Fixture Novel',
    conditions: { language: 'en', ref: { ranobedbId: 81 } },
  };
  const lookups: string[] = [];
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 32 } });
    if (path === '/tv/92')
      return route.fulfill({
        json: {
          id: 92,
          name: 'Fixture Anime',
          originalLanguage: 'ja',
          genres: [{ id: 16, name: 'Animation' }],
          seasons: [
            { id: 1, seasonNumber: 1, name: 'First Season', episodeCount: 12 },
          ],
        },
      });
    if (path === '/continuation/tv/92') {
      lookups.push(url.search);
      return route.fulfill({
        json: {
          available: true,
          sources: [
            {
              anilistId: 42,
              kind: 'novel',
              title: 'Fixture Novel',
              confidence: 'moderate',
              evidence: ['Publisher match'],
              continuation: { volume: 4 },
              continuationBasis: 'derived',
              novel: {
                ranobedbId: 81,
                language: 'en',
                translationPending: true,
                continuationVolume: { title: 'Volume Four' },
              },
              targets: [
                {
                  label: 'continuation',
                  exact: true,
                  href: '/book/OL42W',
                  title: 'Volume Four',
                },
                {
                  label: 'start',
                  exact: false,
                  href: '/search?query=Fixture%20Novel%20%26%20Volume%201',
                  title: 'Fixture Novel',
                },
              ],
            },
          ],
        },
      });
    }
    if (path === '/follow' && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual(subject);
      return route.fulfill({ json: { ...subject, id: 9 } });
    }
    return route.fulfill({ json: { results: [] } });
  });

  await page.goto('./tv/92');
  const find = page.getByRole('button', { name: 'Find Sources' });
  await expect(find).toBeVisible();
  expect(lookups).toEqual([]);
  await find.click();
  await expect(
    page.getByText('Volume Four · Translation pending in English')
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Continuation season' })
    .selectOption('1');
  await expect
    .poll(() => lookups)
    .toEqual(['?language=en', '?language=en&season=1']);
  await expect(
    page.getByRole('link', { name: 'Open Continuation Volume' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Search for Fixture Novel' })
  ).toHaveAttribute('href', /\/search\?q=Fixture\+Novel\+%26\+Volume\+1$/);
  await page.getByRole('button', { name: 'Follow Future Volumes' }).click();
  await expect(
    page.getByRole('button', { name: 'Following', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
});
